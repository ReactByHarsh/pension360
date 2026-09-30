import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { SignJWT, generateKeyPair, exportJWK, customFetch } from "jose";
import { createApp } from "../src/app.js";
import { authenticate, devToken } from "../src/auth.js";
import {
  bootstrapIdentity,
  registeredUser,
  seedDemoUsers,
} from "../src/access.js";
import { errorHandler } from "../src/errors.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "Identity directory and verified OIDC authorization",
  () => {
    const schema = `pension360_access_${randomUUID().replaceAll("-", "")}`;
    let admin: Pool, pool: Pool, app: ReturnType<typeof createApp>;
    const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: databaseUrl });
    const tokens: Record<string, string> = {};
    const auth = (id = "superadmin") => ({
      Authorization: `Bearer ${tokens[id]}`,
    });
    const create = (body: unknown, actor = "superadmin") =>
      request(app).post("/api/v1/access/users").set(auth(actor)).send(body);
    const update = (id: string, body: unknown, actor = "superadmin") =>
      request(app)
        .patch(`/api/v1/access/users/${encodeURIComponent(id)}`)
        .set(auth(actor))
        .send(body);
    const reason = "Reviewed account responsibilities for this isolated test.";
    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`,
      });
      await migrate(pool);
      app = createApp(config, pool);
    });
    beforeEach(async () => {
      await pool.query("DELETE FROM app_users");
      await pool.query("DELETE FROM identity_bootstrap");
      await seedDemoUsers(pool);
      for (const id of [
        "superadmin",
        "admin",
        "officer",
        "reviewer",
        "designer",
        "auditor",
      ])
        tokens[id] = (await devToken(config, id, pool)).accessToken;
    });
    afterAll(async () => {
      await pool?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });

    it("reserves directory administration for Super administrator and exposes only active operational assignees", async () => {
      for (const actor of [
        "admin",
        "officer",
        "reviewer",
        "designer",
        "auditor",
      ]) {
        expect(
          (await request(app).get("/api/v1/access/users").set(auth(actor)))
            .status,
        ).toBe(403);
        expect(
          (
            await create(
              { id: "new", displayName: "New", role: "OFFICER", reason },
              actor,
            )
          ).status,
        ).toBe(403);
      }
      const directory = await request(app)
        .get("/api/v1/access/users?limit=2")
        .set(auth());
      expect(directory.body).toMatchObject({
        total: 6,
        limit: 2,
        hasMore: true,
      });
      expect(directory.body.items[0]).not.toHaveProperty("scope");
      const assignees = await request(app)
        .get("/api/v1/users")
        .set(auth("officer"));
      expect(assignees.status).toBe(200);
      expect(assignees.body.items.map((user: any) => user.id).sort()).toEqual([
        "admin",
        "officer",
        "reviewer",
        "superadmin",
      ]);
      expect(Object.keys(assignees.body.items[0]).sort()).toEqual([
        "id",
        "name",
        "role",
      ]);
      expect(
        (await request(app).get("/api/v1/users").set(auth("designer"))).status,
      ).toBe(403);
    });
    it("audits registration and revision-controlled changes without permitting arbitrary scopes or fields", async () => {
      const created = await create({
        id: "idp|new-officer",
        displayName: "New Officer",
        role: "OFFICER",
        reason,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        id: "idp|new-officer",
        role: "OFFICER",
        active: true,
        revision: 1,
      });
      expect(
        (
          await update(created.body.id, {
            revision: 1,
            role: "AUDITOR",
            displayName: "Audit Colleague",
            reason,
          })
        ).body,
      ).toMatchObject({ role: "AUDITOR", revision: 2 });
      expect(
        (await update(created.body.id, { revision: 1, active: false, reason }))
          .status,
      ).toBe(409);
      expect(
        (
          await update(created.body.id, {
            revision: 2,
            scope: { all: true },
            reason,
          })
        ).status,
      ).toBe(400);
      const events = (
        await pool.query(
          "SELECT action,details FROM audit_events WHERE entity_type='user' AND entity_id=$1 ORDER BY id",
          [created.body.id],
        )
      ).rows;
      expect(events.map((event) => event.action)).toEqual([
        "USER_CREATED",
        "USER_UPDATED",
      ]);
      expect(events[1].details.before.role).toBe("OFFICER");
      expect(events[1].details.after.role).toBe("AUDITOR");
    });
    it("honours directory role changes and deactivation for already-issued tokens and preserves them on reseed", async () => {
      expect(
        (await update("officer", { revision: 1, role: "AUDITOR", reason }))
          .status,
      ).toBe(200);
      const session = await request(app)
        .get("/api/v1/session")
        .set(auth("officer"));
      expect(session.body.user.role).toBe("AUDITOR");
      expect(
        (await request(app).post("/api/v1/cases").set(auth("officer")).send({}))
          .status,
      ).toBe(403);
      expect(
        (await update("officer", { revision: 2, active: false, reason }))
          .status,
      ).toBe(200);
      expect(
        (await request(app).get("/api/v1/members").set(auth("officer"))).status,
      ).toBe(401);
      await seedDemoUsers(pool);
      expect(await registeredUser(pool, "officer")).toMatchObject({
        active: false,
        user: { role: "AUDITOR" },
      });
      expect(
        (
          await request(app)
            .post("/api/v1/auth/dev")
            .send({ userId: "officer" })
        ).status,
      ).toBe(403);
      expect(
        (
          await update("officer", {
            revision: 3,
            active: true,
            role: "OFFICER",
            reason,
          })
        ).status,
      ).toBe(200);
      expect(
        (await request(app).get("/api/v1/session").set(auth("officer"))).body
          .user.role,
      ).toBe("OFFICER");
    });
    it("blocks self-deactivation and last-active-Super demotion, including concurrent requests", async () => {
      expect(
        (await update("superadmin", { revision: 1, active: false, reason }))
          .body.error.code,
      ).toBe("SELF_DEACTIVATION");
      expect(
        (await update("superadmin", { revision: 1, role: "ADMIN", reason }))
          .body.error.code,
      ).toBe("LAST_SUPER_ADMIN");
      await create({
        id: "other-super",
        displayName: "Other Super",
        role: "SUPER_ADMIN",
        reason,
      });
      tokens["other-super"] = await new SignJWT({ role: "SUPER_ADMIN" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("other-super")
        .setIssuer("pension360-development")
        .setAudience("pension360")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(config.devAuthSecret));
      const outcomes = await Promise.all([
        update("superadmin", { revision: 1, role: "ADMIN", reason }),
        update(
          "other-super",
          { revision: 1, role: "ADMIN", reason },
          "other-super",
        ),
      ]);
      expect(outcomes.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) AS total FROM app_users WHERE active AND role='SUPER_ADMIN'",
            )
          ).rows[0].total,
        ),
      ).toBe(1);
    });

    async function oidcHarness(bootstrap?: string) {
      const pair = await generateKeyPair("RS256");
      const publicJwk = {
        ...(await exportJWK(pair.publicKey)),
        kid: "test-rsa",
        alg: "RS256",
        use: "sig",
      };
      const production = loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        OIDC_ISSUER: "https://test-idp.invalid",
        OIDC_AUDIENCE: "pension360-api",
        OIDC_JWKS_URI: "https://test-idp.invalid/jwks",
        ...(bootstrap ? { OIDC_BOOTSTRAP_SUPER_ADMIN_SUBJECT: bootstrap } : {}),
      });
      let jwksRequests = 0;
      const oidcApp = express();
      oidcApp.get(
        "/session",
        authenticate(production, pool, {
          [customFetch]: async () => {
            jwksRequests++;
            return new Response(JSON.stringify({ keys: [publicJwk] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        }),
        (req, res) => res.json(req.user),
      );
      oidcApp.use(errorHandler);
      const token = async (
        subject: string,
        claims: Record<string, unknown> = {},
        options: {
          issuer?: string;
          audience?: string;
          expires?: string;
          issued?: boolean;
        } = {},
      ) => {
        let jwt = new SignJWT(claims)
          .setProtectedHeader({ alg: "RS256", kid: "test-rsa" })
          .setSubject(subject)
          .setIssuer(options.issuer ?? production.oidcIssuer!)
          .setAudience(options.audience ?? production.oidcAudience!)
          .setExpirationTime(options.expires ?? "1h");
        if (options.issued !== false) jwt = jwt.setIssuedAt();
        return jwt.sign(pair.privateKey);
      };
      const get = async (bearer: string) =>
        request(oidcApp)
          .get("/session")
          .set("Authorization", `Bearer ${bearer}`);
      return { token, get, requests: () => jwksRequests };
    }
    it("cryptographically verifies production OIDC tokens and takes the registered role instead of token role claims", async () => {
      const oidc = await oidcHarness();
      const forgedRole = await oidc.token("officer", {
        role: "SUPER_ADMIN",
        name: "Untrusted token display label",
      });
      expect((await oidc.get(forgedRole)).body).toEqual({
        id: "officer",
        name: "Demo Officer",
        role: "OFFICER",
      });
      expect(oidc.requests()).toBe(1);
      expect(
        (
          await oidc.get(
            await oidc.token("unregistered", { role: "SUPER_ADMIN" }),
          )
        ).status,
      ).toBe(401);
      expect((await oidc.get(tokens.officer!)).status).toBe(401);
      for (const options of [
        { issuer: "https://wrong.invalid" },
        { audience: "wrong" },
        { expires: "-1m" },
        { issued: false },
      ])
        expect(
          (await oidc.get(await oidc.token("officer", {}, options))).status,
        ).toBe(401);
      const parts = forgedRole.split(".");
      parts[1] = Buffer.from(
        JSON.stringify({
          sub: "superadmin",
          exp: 9999999999,
          iat: 1,
          iss: "https://test-idp.invalid",
          aud: "pension360-api",
        }),
      ).toString("base64url");
      expect((await oidc.get(parts.join("."))).status).toBe(401);
      await update("officer", { revision: 1, active: false, reason });
      expect((await oidc.get(forgedRole)).status).toBe(401);
    });
    it("bootstraps only the explicit verified subject once into an empty directory and refuses implicit elevation", async () => {
      await pool.query("DELETE FROM app_users");
      const oidc = await oidcHarness("idp|initial-owner");
      expect(
        (
          await oidc.get(
            await oidc.token("idp|somebody-else", { role: "SUPER_ADMIN" }),
          )
        ).status,
      ).toBe(401);
      const response = await oidc.get(
        await oidc.token("idp|initial-owner", { name: "Configured Owner" }),
      );
      expect(response.status).toBe(200);
      expect(response.body.role).toBe("SUPER_ADMIN");
      expect(
        Number(
          (await pool.query("SELECT count(*) AS total FROM identity_bootstrap"))
            .rows[0].total,
        ),
      ).toBe(1);
      await pool.query("DELETE FROM app_users");
      expect(
        (await oidc.get(await oidc.token("idp|initial-owner"))).status,
      ).toBe(401);
      await seedDemoUsers(pool);
      expect(
        await bootstrapIdentity(
          pool,
          "different-owner",
          "Different Owner",
          "operator-cli",
        ),
      ).toBeNull();
    });
  },
);
