import { readdir, access } from "node:fs/promises";
import pg from "pg";
import {
  envPresence,
  present,
  serviceUrl,
  safeErrorCode,
  liveAiRequirements,
  isMain,
  outputReport,
} from "./readiness-utils.mjs";

const root = new URL("../", import.meta.url);
export async function preflight(env = process.env) {
  const checks = [];
  const add = (id, status, detail = {}) =>
    checks.push({ id, status, ...detail });
  const mode = env.NODE_ENV ?? "development";
  const production = mode === "production";
  add(
    "node-runtime",
    process.versions.node.split(".")[0] === "24" ? "passed" : "failed",
    { version: process.versions.node, requiredMajor: 24 },
  );
  const required = envPresence(env, [
    "DATABASE_URL",
    ...(production
      ? [
          "OIDC_ISSUER",
          "OIDC_AUDIENCE",
          "OIDC_JWKS_URI",
          "DOCUMENT_ENCRYPTION_KEY",
          "DOCUMENT_SCAN_URL",
          "SOURCE_ALLOWED_ORIGINS",
        ]
      : []),
  ]);
  add(
    "required-environment",
    required.every((item) => item.present) ? "passed" : "failed",
    { variables: required },
  );
  let config;
  try {
    await access(new URL("apps/api/dist/config.js", root));
    const { loadConfig } = await import(
      new URL("apps/api/dist/config.js", root)
    );
    config = loadConfig(env);
    add("application-configuration", "passed");
  } catch (error) {
    add("application-configuration", "failed", {
      code: safeErrorCode(error),
      note: "Build the API and validate its environment; report intentionally excludes exception text.",
    });
  }

  const encryptionPresent = present(env.DOCUMENT_ENCRYPTION_KEY);
  const encryptionValid =
    encryptionPresent &&
    Buffer.from(env.DOCUMENT_ENCRYPTION_KEY, "base64").length === 32;
  add(
    "document-encryption",
    encryptionValid
      ? "passed"
      : production || encryptionPresent
        ? "failed"
        : "warning",
    {
      configured: encryptionPresent,
      valid32ByteKey: encryptionValid,
      ...(!encryptionPresent
        ? { note: "Development fallback is for fictional data only." }
        : {}),
    },
  );
  const scanner = serviceUrl(env.DOCUMENT_SCAN_URL, { https: production });
  add(
    "scanner-configuration",
    scanner
      ? "passed"
      : production || present(env.DOCUMENT_SCAN_URL)
        ? "failed"
        : "warning",
    {
      configured: present(env.DOCUMENT_SCAN_URL),
      tokenConfigured: present(env.DOCUMENT_SCAN_TOKEN),
    },
  );
  add("scanner-functional-acceptance", "not_run", {
    note: "A URL is not proof of scanning. Validate clean, infected and unavailable scanner responses in the deployment environment.",
  });
  const ai = liveAiRequirements(env);
  add(
    "ai-configuration",
    ai.ready ? "passed" : ai.provider === "disabled" ? "warning" : "failed",
    ai,
  );
  add("ai-live-acceptance", "not_run", {
    note: "Run npm run test:ai:live separately with an explicitly configured provider and model; preflight sends no documents to AI.",
  });

  if (config && present(env.DATABASE_URL)) {
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      max: 1,
    });
    try {
      const version = Number(
        (await pool.query("SHOW server_version_num")).rows[0]
          .server_version_num,
      );
      add("database-connection", "passed");
      add(
        "postgres-version",
        version >= 180006 && version < 190000 ? "passed" : "failed",
        {
          versionNumber: version,
          required: "PostgreSQL 18.6 or later 18.x patch",
        },
      );
      const expected = (await readdir(new URL("apps/api/migrations/", root)))
        .filter((file) => file.endsWith(".sql"))
        .sort();
      const applied = new Set(
        (await pool.query("SELECT version FROM schema_migrations")).rows.map(
          (row) => row.version,
        ),
      );
      const missing = expected.filter((file) => !applied.has(file));
      add("database-migrations", missing.length ? "failed" : "passed", {
        expectedCount: expected.length,
        appliedExpectedCount: expected.length - missing.length,
        missing,
      });
      if (!missing.length) {
        const users = (
          await pool.query(
            "SELECT count(*)::int AS total, count(*) FILTER (WHERE active AND role='SUPER_ADMIN')::int AS super_admins FROM app_users",
          )
        ).rows[0];
        const bootstrap = (
          await pool.query(
            "SELECT count(*)::int AS count FROM identity_bootstrap",
          )
        ).rows[0].count;
        const pendingBootstrap =
          users.total === 0 &&
          bootstrap === 0 &&
          present(env.OIDC_BOOTSTRAP_SUPER_ADMIN_SUBJECT);
        add(
          "identity-directory",
          users.super_admins > 0
            ? "passed"
            : production && !pendingBootstrap
              ? "failed"
              : "warning",
          {
            registeredCount: users.total,
            activeSuperAdminCount: users.super_admins,
            verifiedFirstLoginBootstrapPending: pendingBootstrap,
          },
        );
        const sources = (
          await pool.query(
            "SELECT base_url, credential_ref FROM connections WHERE enabled",
          )
        ).rows;
        let invalidOrigins = 0,
          unavailableCredentials = 0;
        for (const source of sources) {
          const url = serviceUrl(source.base_url, { https: false });
          if (
            !url ||
            !config.sourceAllowedOrigins.includes(url.origin) ||
            (url.protocol === "http:" &&
              !config.sourceAllowHttpOrigins.includes(url.origin))
          )
            invalidOrigins++;
          if (
            source.credential_ref &&
            (!config.sourceCredentialRefs.includes(source.credential_ref) ||
              !present(env[source.credential_ref]))
          )
            unavailableCredentials++;
        }
        add(
          "source-registry-configuration",
          invalidOrigins || unavailableCredentials
            ? "failed"
            : sources.length
              ? "passed"
              : "warning",
          {
            enabledConnections: sources.length,
            invalidOrigins,
            unavailableCredentials,
            note: "Configuration check only. Verify registered REST reads and intake previews with the source owner; no arbitrary source endpoint is called.",
          },
        );
      }
    } catch (error) {
      add("database-checks", "failed", { code: safeErrorCode(error) });
    } finally {
      await pool.end();
    }
  } else
    add("database-checks", "not_run", {
      note: "An explicit DATABASE_URL and valid application configuration are required.",
    });

  const apiOrigin = serviceUrl(
    env.PREFLIGHT_API_URL ?? `http://127.0.0.1:${env.PORT ?? 4000}`,
    { https: false },
  );
  if (apiOrigin) {
    for (const [path, expected] of [
      ["/health/live", "ok"],
      ["/health/ready", "ready"],
    ]) {
      try {
        const response = await fetch(new URL(path, apiOrigin), {
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        const value = await response.json();
        add(
          path.slice(1).replace("/", "-"),
          response.ok && value.status === expected ? "passed" : "failed",
          { httpStatus: response.status },
        );
      } catch (error) {
        add(path.slice(1).replace("/", "-"), "failed", {
          code: safeErrorCode(error),
        });
      }
    }
  } else
    add("health-endpoint", "failed", {
      note: "PREFLIGHT_API_URL must be an HTTP(S) URL without credentials, query or fragment.",
    });

  const oidc = envPresence(env, [
    "OIDC_ISSUER",
    "OIDC_AUDIENCE",
    "OIDC_JWKS_URI",
  ]);
  const oidcConfigured = oidc.every((item) => item.present);
  add(
    "sso-configuration",
    oidcConfigured &&
      serviceUrl(env.OIDC_ISSUER) &&
      serviceUrl(env.OIDC_JWKS_URI)
      ? "passed"
      : production
        ? "failed"
        : "warning",
    { variables: oidc },
  );
  if (oidcConfigured && serviceUrl(env.OIDC_JWKS_URI)) {
    try {
      const response = await fetch(env.OIDC_JWKS_URI, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      const body = await response.json();
      const valid =
        response.ok &&
        Array.isArray(body.keys) &&
        body.keys.some((key) => key && ["RSA", "EC", "OKP"].includes(key.kty));
      add("sso-jwks-reachable", valid ? "passed" : "failed", {
        httpStatus: response.status,
        containsVerificationKey: valid,
      });
    } catch (error) {
      add("sso-jwks-reachable", "failed", { code: safeErrorCode(error) });
    }
  } else add("sso-jwks-reachable", "not_run");
  add("sso-login-acceptance", "not_run", {
    note: "JWKS reachability does not verify login, issuer/audience claims, role registration or deactivation; exercise these with real IdP accounts.",
  });
  add("worker-and-recovery-acceptance", "not_run", {
    note: "Health does not prove a worker is running. Verify extraction job completion and run the documented backup/restore drill separately.",
  });
  const failed = checks.filter((check) => check.status === "failed").length;
  return {
    schemaVersion: 1,
    kind: "deployment-preflight",
    asOf: new Date().toISOString(),
    mode: ["production", "development", "test"].includes(mode)
      ? mode
      : "invalid",
    status: failed
      ? "failed"
      : checks.some((check) => ["warning", "not_run"].includes(check.status))
        ? "attention_required"
        : "passed",
    productionAcceptanceComplete: false,
    readOnly: true,
    failedChecks: failed,
    checks,
  };
}

if (isMain(import.meta.url)) {
  try {
    const report = await preflight();
    await outputReport(report);
    process.exitCode = report.failedChecks ? 1 : 0;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ kind: "deployment-preflight", status: "failed", code: safeErrorCode(error) })}\n`,
    );
    process.exitCode = 1;
  }
}
