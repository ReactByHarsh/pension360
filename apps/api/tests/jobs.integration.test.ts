import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { registerDomainRoutes } from "../src/domain.js";
import { processOneJob } from "../src/jobs.js";
import type { AiProvider, AiResult } from "../src/ai.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=";

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function bounded<T>(
  promise: Promise<T>,
  milliseconds = 6000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Concurrency barrier did not complete before its deadline",
              ),
            ),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function result(value: string, documentId: string): AiResult {
  return {
    answer: `Explicit test extraction ${value}`,
    citationIds: [documentId],
    fields: [
      {
        name: "Fictional reference",
        value,
        evidence: { page: 1, quote: value },
        uncertain: false,
      },
    ],
  };
}

/** Instrument real client boundaries while retaining actual PostgreSQL transactions and row locks. */
function instrumentedPool(
  pool: Pool,
  beforeQuery?: (sql: string, values: unknown[]) => Promise<void>,
  afterDispatch?: (sql: string, values: unknown[]) => void,
): Pool {
  return new Proxy(pool, {
    get(target, property) {
      if (property === "connect") {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, key) {
              if (key === "query") {
                return async (sql: string, values: unknown[] = []) => {
                  await beforeQuery?.(sql, values);
                  const dispatched = connection.query(sql, values);
                  afterDispatch?.(sql, values);
                  return dispatched;
                };
              }
              const value = Reflect.get(connection, key, connection);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          }) as PoolClient;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe.skipIf(!databaseUrl)(
  "durable document-job concurrency with real PostgreSQL",
  () => {
    let pool: Pool;
    let adminPool: Pool;
    let app: ReturnType<typeof createApp>;
    let officerToken: string;
    const schema = `pension360_jobs_${randomUUID().replaceAll("-", "")}`;
    const unusedProvider: AiProvider = {
      name: "explicit-unused-route-provider",
      async complete() {
        throw new Error(
          "These document endpoints must not call the provider directly",
        );
      },
    };
    const scanner = async () => {};
    const auth = () => ({ Authorization: `Bearer ${officerToken}` });

    async function upload(title: string) {
      const response = await request(app)
        .post("/api/v1/documents")
        .set(auth())
        .send({
          memberId: "M001",
          title,
          mimeType: "image/png",
          base64: png,
        });
      expect(response.status, JSON.stringify(response.body)).toBe(202);
      return response.body.id as string;
    }

    beforeAll(async () => {
      adminPool = new Pool({ connectionString: databaseUrl });
      await adminPool.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
        statement_timeout: 5000,
        max: 12,
      });
      await migrate(pool);
      await seed(pool);
      app = createApp(
        loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl }),
        pool,
        (router, deps) => registerDomainRoutes(router, deps, unusedProvider),
      );
      const login = await request(app)
        .post("/api/v1/auth/dev")
        .send({ userId: "officer" });
      expect(login.status).toBe(200);
      officerToken = login.body.accessToken;
    }, 60000);

    afterAll(async () => {
      await pool?.end();
      if (adminPool) {
        await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await adminPool.end();
      }
    });

    it("fences a delayed stale worker after another lease has completed", async () => {
      const documentId = await upload("Fictional stale-lease fencing evidence");
      const oldEntered = barrier();
      const releaseOld = barrier();
      let oldCalls = 0;
      let newCalls = 0;
      const oldProvider: AiProvider = {
        name: "explicit-old-delayed-provider",
        async complete() {
          oldCalls++;
          oldEntered.release();
          await releaseOld.promise;
          return result("STALE-VALUE", documentId);
        },
      };
      const newProvider: AiProvider = {
        name: "explicit-replacement-provider",
        async complete() {
          newCalls++;
          return result("CURRENT-VALUE", documentId);
        },
      };
      const oldWorker = processOneJob(pool, oldProvider, scanner);
      try {
        await bounded(oldEntered.promise);
        const oldJob = (
          await pool.query("SELECT * FROM jobs WHERE entity_id=$1", [
            documentId,
          ])
        ).rows[0];
        expect(oldJob.status).toBe("RUNNING");
        expect(oldJob.attempts).toBe(1);
        expect(oldJob.lease_token).toBeTruthy();
        await pool.query(
          "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
          [oldJob.id],
        );

        expect(await bounded(processOneJob(pool, newProvider, scanner))).toBe(
          true,
        );
        const beforeLateResult = (
          await pool.query("SELECT * FROM documents WHERE id=$1", [documentId])
        ).rows[0];
        expect(beforeLateResult.status).toBe("EXTRACTED");
        expect(beforeLateResult.fields).toEqual(
          result("CURRENT-VALUE", documentId).fields,
        );
        expect(beforeLateResult.provider).toBe(newProvider.name);
        releaseOld.release();
        expect(await bounded(oldWorker)).toBe(true);

        const afterLateResult = (
          await pool.query("SELECT * FROM documents WHERE id=$1", [documentId])
        ).rows[0];
        expect(afterLateResult.fields).toEqual(beforeLateResult.fields);
        expect(afterLateResult.summary).toBe(beforeLateResult.summary);
        expect(afterLateResult.provider).toBe(newProvider.name);
        expect(afterLateResult.revision).toBe(beforeLateResult.revision);
        const finalJob = (
          await pool.query("SELECT * FROM jobs WHERE id=$1", [oldJob.id])
        ).rows[0];
        expect(finalJob).toMatchObject({
          status: "COMPLETED",
          attempts: 2,
          lease_token: null,
          lease_until: null,
        });
        expect(oldCalls).toBe(1);
        expect(newCalls).toBe(1);
        expect(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action='DOCUMENT_EXTRACTED'",
              [documentId],
            )
          ).rows[0].n,
        ).toBe(1);
      } finally {
        releaseOld.release();
        await bounded(oldWorker).catch(() => {});
      }
    }, 15000);

    it("makes an exhausted crashed lease terminal and permits an explicit recovery", async () => {
      const documentId = await upload("Fictional exhausted crash lease");
      await pool.query(
        "UPDATE jobs SET status='RUNNING',attempts=max_attempts,lease_until=now()-interval '1 second',lease_token=$2 WHERE entity_id=$1",
        [documentId, randomUUID()],
      );
      await pool.query("UPDATE documents SET status='PROCESSING' WHERE id=$1", [
        documentId,
      ]);
      let calls = 0;
      const provider: AiProvider = {
        name: "explicit-recovery-provider",
        async complete() {
          calls++;
          return result("RECOVERED-VALUE", documentId);
        },
      };
      expect(await processOneJob(pool, provider, scanner)).toBe(false);
      expect(calls).toBe(0);
      const failedJob = (
        await pool.query("SELECT * FROM jobs WHERE entity_id=$1", [documentId])
      ).rows[0];
      expect(failedJob).toMatchObject({
        status: "FAILED",
        last_error: "WORKER_LEASE_EXHAUSTED",
        lease_token: null,
        lease_until: null,
      });
      expect(failedJob.attempts).toBe(failedJob.max_attempts);
      expect(
        (
          await pool.query(
            "SELECT status,last_error FROM documents WHERE id=$1",
            [documentId],
          )
        ).rows[0],
      ).toMatchObject({
        status: "FAILED",
        last_error: "WORKER_LEASE_EXHAUSTED",
      });

      const retry = await request(app)
        .post(`/api/v1/documents/${documentId}/extract`)
        .set(auth())
        .send({});
      expect(retry.status).toBe(202);
      expect(retry.body.status).toBe("QUEUED");
      expect(
        (
          await pool.query(
            "SELECT attempts,lease_token FROM jobs WHERE entity_id=$1",
            [documentId],
          )
        ).rows[0],
      ).toMatchObject({ attempts: 0, lease_token: null });
      expect(await processOneJob(pool, provider, scanner)).toBe(true);
      expect(calls).toBe(1);
      expect(
        (
          await pool.query("SELECT status FROM jobs WHERE entity_id=$1", [
            documentId,
          ])
        ).rows[0].status,
      ).toBe("COMPLETED");
    });

    it("serializes an extraction retry request with a worker claim using job-before-document locks", async () => {
      const documentId = await upload("Fictional concurrent extract request");
      const workerHoldsJob = barrier();
      const releaseWorker = barrier();
      const requestDispatchedJobLock = barrier();
      let calls = 0;
      const provider: AiProvider = {
        name: "explicit-concurrency-provider",
        async complete() {
          calls++;
          return result("ONE-EXTRACTION", documentId);
        },
      };
      const workerPool = instrumentedPool(pool, async (sql, values) => {
        if (
          sql.includes("UPDATE documents SET status='PROCESSING'") &&
          values[0] === documentId
        ) {
          workerHoldsJob.release();
          await releaseWorker.promise;
        }
      });
      const requestPool = instrumentedPool(pool, undefined, (sql, values) => {
        if (
          sql.includes("SELECT * FROM jobs WHERE entity_id=") &&
          sql.includes("FOR UPDATE") &&
          values[0] === documentId
        ) {
          requestDispatchedJobLock.release();
        }
      });
      const retryApp = createApp(
        loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl }),
        requestPool,
        (router, deps) => registerDomainRoutes(router, deps, unusedProvider),
      );
      const worker = processOneJob(workerPool, provider, scanner);
      let retryRequest: Promise<request.Response> | undefined;
      try {
        await bounded(workerHoldsJob.promise);
        retryRequest = request(retryApp)
          .post(`/api/v1/documents/${documentId}/extract`)
          .set(auth())
          .send({})
          .timeout({ response: 6000, deadline: 7000 })
          .then((response) => response);
        await bounded(requestDispatchedJobLock.promise);
        // With reversed lock order the request would already hold the document lock,
        // so releasing the worker here would produce a real PostgreSQL deadlock.
        releaseWorker.release();
        const [worked, response] = await bounded(
          Promise.all([worker, retryRequest]),
          8000,
        );
        expect(worked).toBe(true);
        expect(response.status, JSON.stringify(response.body)).toBe(202);
        expect(calls).toBe(1);
        const job = (
          await pool.query("SELECT * FROM jobs WHERE entity_id=$1", [
            documentId,
          ])
        ).rows[0];
        expect(job).toMatchObject({
          status: "COMPLETED",
          attempts: 1,
          lease_token: null,
        });
        const doc = (
          await pool.query("SELECT status,fields FROM documents WHERE id=$1", [
            documentId,
          ])
        ).rows[0];
        expect(doc.status).toBe("EXTRACTED");
        expect(doc.fields).toEqual(result("ONE-EXTRACTION", documentId).fields);
        expect(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action='DOCUMENT_EXTRACTED'",
              [documentId],
            )
          ).rows[0].n,
        ).toBe(1);
      } finally {
        releaseWorker.release();
        await bounded(worker).catch(() => {});
        if (retryRequest) await retryRequest.catch(() => {});
      }
    }, 20000);
  },
);
