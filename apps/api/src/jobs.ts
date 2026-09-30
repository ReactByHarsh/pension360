import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { transaction, audit } from "./db.js";
import { ApiError } from "./errors.js";
import { createAiProvider, decryptContent, type AiProvider } from "./ai.js";

export async function scanContent(
  bytes: Buffer,
  mimeType: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const endpoint = env.DOCUMENT_SCAN_URL;
  if (!endpoint) {
    if (env.NODE_ENV === "production")
      throw new ApiError(
        503,
        "SCAN_NOT_CONFIGURED",
        "Production document processing requires a malware scanning service",
      );
    return;
  }
  const url = new URL(endpoint);
  if (url.username || url.password || url.protocol !== "https:")
    throw new ApiError(
      503,
      "SCAN_CONFIG_INVALID",
      "Malware scanning requires a server configured HTTPS endpoint",
    );
  const response = await fetch(url, {
    method: "POST",
    body: new Uint8Array(bytes),
    headers: {
      "Content-Type": mimeType,
      ...(env.DOCUMENT_SCAN_TOKEN
        ? { Authorization: `Bearer ${env.DOCUMENT_SCAN_TOKEN}` }
        : {}),
    },
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok)
    throw new ApiError(
      503,
      "SCAN_UNAVAILABLE",
      "Document scanning did not complete",
    );
  const result = (await response.json()) as { clean?: boolean };
  if (result.clean !== true)
    throw new ApiError(
      422,
      "DOCUMENT_UNSAFE",
      "The document did not pass malware scanning",
    );
}
export async function processOneJob(
  pool: Pool,
  provider: AiProvider = createAiProvider(),
  scan = scanContent,
): Promise<boolean> {
  const token = randomUUID();
  const job = await transaction(pool, async (db) => {
    // Exhausted crashed leases are terminal, never silently left RUNNING.
    const exhausted = await db.query(
      "UPDATE jobs SET status='FAILED',last_error='WORKER_LEASE_EXHAUSTED',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status='RUNNING' AND lease_until<now() AND attempts>=max_attempts RETURNING entity_id",
    );
    for (const row of exhausted.rows)
      await db.query(
        "UPDATE documents SET status='FAILED',last_error='WORKER_LEASE_EXHAUSTED',revision=revision+1 WHERE id=$1 AND status<>'VERIFIED'",
        [row.entity_id],
      );
    const row = (
      await db.query(
        "SELECT * FROM jobs WHERE attempts<max_attempts AND ((status='QUEUED' AND available_at<=now()) OR (status='RUNNING' AND lease_until<now())) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!row) return null;
    const claimed = (
      await db.query(
        "UPDATE jobs SET status='RUNNING',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '150 seconds',updated_at=now() WHERE id=$1 RETURNING *",
        [row.id, token],
      )
    ).rows[0];
    await db.query(
      "UPDATE documents SET status='PROCESSING',updated_at=now() WHERE id=$1 AND status<>'VERIFIED'",
      [row.entity_id],
    );
    return claimed;
  });
  if (!job) return false;
  try {
    const doc = (
      await pool.query("SELECT * FROM documents WHERE id=$1", [job.entity_id])
    ).rows[0];
    if (!doc || doc.status === "VERIFIED")
      throw new ApiError(
        409,
        "DOCUMENT_NOT_EXTRACTABLE",
        "The document is unavailable for extraction",
      );
    const bytes = decryptContent(doc.content_encrypted);
    await scan(bytes, doc.mime_type);
    await pool.query(
      "UPDATE documents SET scan_status=$2 WHERE id=$1 AND EXISTS (SELECT 1 FROM jobs WHERE id=$3 AND lease_token=$4 AND status='RUNNING')",
      [
        doc.id,
        process.env.DOCUMENT_SCAN_URL ? "CLEAN" : "NOT_CONFIGURED",
        job.id,
        token,
      ],
    );
    const result = await provider.complete({
      kind: "EXTRACT",
      language: "en",
      context: { documentId: doc.id, title: doc.title },
      allowedCitationIds: [doc.id],
      attachment: {
        mimeType: doc.mime_type,
        base64: bytes.toString("base64"),
        filename: `evidence.${doc.mime_type === "application/pdf" ? "pdf" : doc.mime_type === "image/png" ? "png" : "jpg"}`,
      },
    });
    await transaction(pool, async (db) => {
      const owned = (
        await db.query(
          "SELECT * FROM jobs WHERE id=$1 AND lease_token=$2 AND status='RUNNING' FOR UPDATE",
          [job.id, token],
        )
      ).rows[0];
      if (!owned) return;
      await db.query(
        "UPDATE documents SET status='EXTRACTED',fields=$2,summary=$3,provider=$4,last_error=NULL,revision=revision+1,updated_at=now() WHERE id=$1 AND status='PROCESSING'",
        [doc.id, JSON.stringify(result.fields), result.answer, provider.name],
      );
      await db.query(
        "UPDATE jobs SET status='COMPLETED',lease_until=NULL,lease_token=NULL,last_error=NULL,updated_at=now() WHERE id=$1",
        [job.id],
      );
      await audit(db, "worker", "DOCUMENT_EXTRACTED", "document", doc.id, {
        jobId: job.id,
        provider: provider.name,
        requiresHumanReview: true,
      });
    });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "EXTRACTION_FAILED";
    const terminal =
      [
        "DOCUMENT_UNSAFE",
        "DOCUMENT_NOT_EXTRACTABLE",
        "OFFLINE_VISION_NOT_CONFIGURED",
      ].includes(code) || job.attempts >= job.max_attempts;
    await transaction(pool, async (db) => {
      const owned = (
        await db.query(
          "SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND status='RUNNING' FOR UPDATE",
          [job.id, token],
        )
      ).rows[0];
      if (!owned) return;
      await db.query(
        "UPDATE jobs SET status=$2,last_error=$3,lease_until=NULL,lease_token=NULL,available_at=now()+($4*interval '1 second'),updated_at=now() WHERE id=$1",
        [
          job.id,
          terminal ? "FAILED" : "QUEUED",
          code,
          Math.min(300, 20 * 2 ** job.attempts),
        ],
      );
      await db.query(
        "UPDATE documents SET status=$2,last_error=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND status<>'VERIFIED'",
        [job.entity_id, terminal ? "FAILED" : "QUEUED", code],
      );
      if (code === "DOCUMENT_UNSAFE")
        await db.query(
          "UPDATE documents SET scan_status='REJECTED' WHERE id=$1",
          [job.entity_id],
        );
      await audit(
        db,
        "worker",
        terminal ? "JOB_FAILED" : "JOB_RETRY_SCHEDULED",
        "job",
        job.id,
        { code, attempt: job.attempts },
      );
    });
  }
  return true;
}
