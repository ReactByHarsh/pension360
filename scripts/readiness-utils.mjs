import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const present = (value) =>
  typeof value === "string" && value.trim().length > 0;
export function envPresence(env, names) {
  return names.map((name) => ({ name, present: present(env[name]) }));
}
export function serviceUrl(value, { https = true } = {}) {
  try {
    const url = new URL(value);
    return !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      (https
        ? url.protocol === "https:"
        : ["http:", "https:"].includes(url.protocol))
      ? url
      : null;
  } catch {
    return null;
  }
}
// Messages from HTTP, database and model clients may contain URLs, prompts or secrets.
// Only a fixed list of codes is allowed into an operator report.
export function safeErrorCode(error) {
  const allowed = new Set([
    "AI_NOT_CONFIGURED",
    "AI_CONNECTION_FAILED",
    "AI_INVALID_OUTPUT",
    "AI_INVALID_CITATION",
    "AI_INCOMPLETE",
    "AI_UNAVAILABLE",
    "AI_CONFIG_INVALID",
    "OFFLINE_VISION_NOT_CONFIGURED",
    "AI_PROVIDER_ERROR",
    "AI_RATE_LIMITED",
    "AI_EMPTY_RESPONSE",
    "AI_RESPONSE_TOO_LARGE",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "28P01",
    "3D000",
    "42P01",
  ]);
  return allowed.has(error?.code) ? error.code : "CHECK_FAILED";
}
export function liveAiRequirements(env) {
  const provider = env.AI_PROVIDER ?? "openai";
  if (provider === "disabled")
    return { provider, ready: false, reason: "AI_DISABLED", required: [] };
  if (!["openai", "compatible"].includes(provider))
    return {
      provider: "invalid",
      ready: false,
      reason: "AI_PROVIDER_INVALID",
      required: [],
    };
  const required = envPresence(
    env,
    provider === "openai"
      ? ["OPENAI_API_KEY", "OPENAI_MODEL"]
      : ["OFFLINE_LLM_BASE_URL", "OFFLINE_LLM_MODEL"],
  );
  if (required.some((item) => !item.present))
    return { provider, ready: false, reason: "AI_NOT_CONFIGURED", required };
  if (
    provider === "compatible" &&
    !serviceUrl(env.OFFLINE_LLM_BASE_URL, {
      https:
        env.NODE_ENV === "production" && env.OFFLINE_LLM_ALLOW_HTTP !== "true",
    })
  ) {
    return { provider, ready: false, reason: "AI_CONFIG_INVALID", required };
  }
  return { provider, ready: true, required };
}
export function isMain(url) {
  return (
    Boolean(process.argv[1]) &&
    url === pathToFileURL(resolve(process.argv[1])).href
  );
}
export async function outputReport(report, args = process.argv.slice(2)) {
  const index = args.indexOf("--output");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (index >= 0) {
    if (!args[index + 1] || args[index + 1].startsWith("--"))
      throw new Error("OUTPUT_PATH_REQUIRED");
    const destination = resolve(args[index + 1]);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, json, { mode: 0o600 });
  }
  process.stdout.write(json);
}
