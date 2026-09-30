import test from "node:test";
import assert from "node:assert/strict";
import {
  envPresence,
  liveAiRequirements,
  serviceUrl,
  safeErrorCode,
} from "./readiness-utils.mjs";
import { liveAiAcceptance } from "./live-ai-acceptance.mjs";
import { preflight } from "./preflight.mjs";

test("configuration reporting includes presence only, never values", () => {
  const secret = "private-token-value";
  const output = JSON.stringify(
    envPresence({ OPENAI_API_KEY: secret, OPENAI_MODEL: "model-private" }, [
      "OPENAI_API_KEY",
      "OPENAI_MODEL",
      "DATABASE_URL",
    ]),
  );
  assert.equal(output.includes(secret), false);
  assert.equal(output.includes("model-private"), false);
  assert.deepEqual(
    JSON.parse(output).map((item) => item.present),
    [true, true, false],
  );
});
test("configured model and key are both required before OpenAI calls", async () => {
  for (const env of [
    {},
    { OPENAI_API_KEY: "placeholder" },
    { OPENAI_MODEL: "placeholder" },
    { AI_PROVIDER: "disabled" },
  ]) {
    const result = await liveAiAcceptance(env);
    assert.equal(result.status, "not_run");
    assert.equal(result.providerCallsAttempted, 0);
  }
});
test("text-only compatible adapter cannot pass PDF acceptance", async () => {
  const env = {
    AI_PROVIDER: "compatible",
    OFFLINE_LLM_BASE_URL: "http://127.0.0.1:8000/v1",
    OFFLINE_LLM_MODEL: "local-model",
  };
  assert.equal(liveAiRequirements(env).ready, true);
  const result = await liveAiAcceptance(env);
  assert.equal(result.reason, "OFFLINE_VISION_NOT_CONFIGURED");
  assert.equal(result.providerCallsAttempted, 0);
});
test("service endpoints reject embedded credentials, queries and insecure production defaults", () => {
  for (const value of [
    "https://user:secret@example.org",
    "https://example.org?token=secret",
    "file:///tmp",
    "http://example.org",
    "https://example.org#secret",
  ])
    assert.equal(serviceUrl(value), null);
  assert.ok(serviceUrl("https://example.org/scanner"));
  assert.ok(serviceUrl("http://127.0.0.1:4000", { https: false }));
});
test("untrusted exception messages and arbitrary codes are never exposed", () => {
  assert.equal(
    safeErrorCode({
      code: "secret-key",
      message: "postgres://private:password@host",
    }),
    "CHECK_FAILED",
  );
  assert.equal(
    safeErrorCode({ code: "28P01", message: "password-revealed" }),
    "28P01",
  );
  assert.equal(
    safeErrorCode(new Error("sensitive model output")),
    "CHECK_FAILED",
  );
});

test("invalid production setup reports failures without leaking supplied credentials or contacting dependencies", async () => {
  const report = await preflight({
    NODE_ENV: "production",
    DATABASE_URL:
      "postgres://private-user:private-password@invalid.invalid/database",
    PREFLIGHT_API_URL: "invalid-url",
    AI_PROVIDER: "disabled",
  });
  assert.equal(report.status, "failed");
  assert.equal(report.productionAcceptanceComplete, false);
  assert.equal(
    report.checks.find((check) => check.id === "database-checks").status,
    "not_run",
  );
  assert.equal(
    report.checks.find((check) => check.id === "sso-jwks-reachable").status,
    "not_run",
  );
  const json = JSON.stringify(report);
  assert.equal(json.includes("private-password"), false);
  assert.equal(json.includes("private-user"), false);
  assert.equal(json.includes("invalid.invalid"), false);
});
