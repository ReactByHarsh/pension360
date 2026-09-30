import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { createHash } from "node:crypto";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { Issue, Mapping, Source } from "./types.js";
import { ApiError } from "./errors.js";

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}
export function pointerGet(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/"))
    throw new Error("Source path must be a JSON Pointer");
  let current: unknown = root;
  for (const raw of pointer.slice(1).split("/")) {
    if (/~(?![01])/.test(raw)) throw new Error("Invalid pointer escape");
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (FORBIDDEN.has(key)) throw new Error("Unsafe field path");
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
export function setPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".");
  if (
    !keys.length ||
    keys.some((k) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || FORBIDDEN.has(k))
  )
    throw new Error("Unsafe target field path");
  let current = root;
  for (const key of keys.slice(0, -1)) {
    if (
      Object.hasOwn(current, key) &&
      (current[key] === null ||
        typeof current[key] !== "object" ||
        Array.isArray(current[key]))
    )
      throw new Error("Mapping paths overlap");
    if (!Object.hasOwn(current, key))
      current[key] = Object.create(null) as Record<string, unknown>;
    current = current[key] as Record<string, unknown>;
  }
  const last = keys.at(-1)!;
  if (Object.hasOwn(current, last)) throw new Error("Duplicate target field");
  current[last] = value;
}
function yearsBetween(from: string, to: string): number {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new Error("Invalid or future source date");
  let years = Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  if (to.slice(5) < from.slice(5)) years -= 1;
  return years;
}
export function applyMappings(
  response: unknown,
  mappings: Mapping[],
  assessmentDate: string,
): { input: Record<string, unknown>; issues: Issue[] } {
  if (!validDate(assessmentDate))
    throw new ApiError(
      400,
      "INVALID_DATE",
      "Assessment date must be a valid ISO calendar date",
    );
  const input: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  const issues: Issue[] = [];
  for (const mapping of mappings) {
    try {
      let value = pointerGet(response, mapping.sourcePath);
      if (value === null || value === undefined || value === "") {
        if (mapping.required)
          issues.push({
            code: "MISSING_REQUIRED_FIELD",
            message: `Required data is missing: ${mapping.targetPath}`,
            field: mapping.targetPath,
          });
        continue;
      }
      if (mapping.transform !== "identity") {
        if (typeof value !== "string")
          throw new Error("Date transform requires a date string");
        value = yearsBetween(value, assessmentDate);
      }
      if (mapping.type === "number") {
        if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value))
          value = Number(value);
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          Math.abs(value) > Number.MAX_SAFE_INTEGER
        )
          throw new Error("Expected a finite safe number");
      } else if (mapping.type === "boolean") {
        if (typeof value !== "boolean") throw new Error("Expected a boolean");
      } else if (mapping.type === "date") {
        if (typeof value !== "string" || !validDate(value))
          throw new Error("Expected ISO date YYYY-MM-DD");
      } else if (typeof value !== "string")
        throw new Error("Expected a string");
      setPath(input, mapping.targetPath, value);
    } catch (error) {
      issues.push({
        code: "INVALID_MAPPING_VALUE",
        message: `${mapping.targetPath}: ${(error as Error).message}`,
        field: mapping.targetPath,
      });
    }
  }
  return { input, issues };
}
function ipv4(address: string): number[] | null {
  const p = address.split(".").map(Number);
  return p.length === 4 &&
    p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? p
    : null;
}
export function addressClass(
  address: string,
): "public" | "private" | "forbidden" {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:"))
    return addressClass(normalized.slice(7));
  const v4 = ipv4(normalized);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    if (
      a === 0 ||
      (a === 169 && b === 254) ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0)
    )
      return "forbidden";
    if (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
      return "private";
    return "public";
  }
  if (net.isIP(normalized) === 6) {
    if (
      normalized === "::" ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8") ||
      normalized.startsWith("64:ff9b:")
    )
      return "forbidden";
    if (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd")
    )
      return "private";
    return "public";
  }
  return "forbidden";
}
export function validateOrigin(raw: string, config: Config): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(
      400,
      "INVALID_SOURCE_URL",
      "Enter a valid registered source URL",
    );
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new ApiError(
      400,
      "INVALID_SOURCE_URL",
      "Source URLs cannot contain credentials, query strings or fragments",
    );
  if (!config.sourceAllowedOrigins.includes(url.origin))
    throw new ApiError(
      400,
      "SOURCE_NOT_ALLOWED",
      "Source origin is not permitted by server configuration",
    );
  if (
    url.protocol === "http:" &&
    !config.sourceAllowHttpOrigins.includes(url.origin)
  )
    throw new ApiError(400, "HTTPS_REQUIRED", "This source requires HTTPS");
  return url;
}
export function buildRequestUrl(
  base: URL,
  source: Source,
  memberId: string,
  assessmentDate: string,
): { url: URL; body?: string } {
  if (
    !source.path.startsWith("/") ||
    source.path.startsWith("//") ||
    source.path.includes("\\") ||
    source.path.includes("#") ||
    /%2f|%5c/i.test(source.path)
  )
    throw new ApiError(
      400,
      "INVALID_SOURCE_PATH",
      "Use a local absolute operation path",
    );
  let operation = source.path;
  const query: [string, string][] = [];
  const body: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const binding of source.bindings) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(binding.key) ||
      FORBIDDEN.has(binding.key)
    )
      throw new ApiError(400, "INVALID_BINDING", "Invalid binding name");
    const value =
      binding.valueFrom === "memberId"
        ? memberId
        : binding.valueFrom === "assessmentDate"
          ? assessmentDate
          : (binding.constant ?? "");
    if (binding.location === "path")
      operation = operation.replaceAll(
        `{${binding.key}}`,
        encodeURIComponent(value),
      );
    else if (binding.location === "query") query.push([binding.key, value]);
    else body[binding.key] = value;
  }
  if (/\{[^}]*\}/.test(operation))
    throw new ApiError(
      400,
      "MISSING_BINDING",
      "Configure every path parameter",
    );
  const basePath = base.pathname.replace(/\/$/, "");
  const url = new URL(`${base.origin}${basePath}${operation}`);
  if (url.origin !== base.origin)
    throw new ApiError(
      400,
      "INVALID_SOURCE_PATH",
      "Operation must use the registered origin",
    );
  if (
    basePath &&
    url.pathname !== basePath &&
    !url.pathname.startsWith(`${basePath}/`)
  )
    throw new ApiError(
      400,
      "INVALID_SOURCE_PATH",
      "Operation cannot escape the registered base path",
    );
  for (const [key, value] of query) url.searchParams.set(key, value);
  if (source.method === "GET" && Object.keys(body).length)
    throw new ApiError(
      400,
      "INVALID_BINDING",
      "GET operations cannot have body bindings",
    );
  return {
    url,
    body: source.method === "POST" ? JSON.stringify(body) : undefined,
  };
}
export async function fetchSource(
  db: Db,
  config: Config,
  source: Source,
  memberId: string,
  assessmentDate: string,
): Promise<{ sourceResponse: unknown; provenance: Record<string, unknown> }> {
  const connection = (
    await db.query("SELECT * FROM connections WHERE id=$1 AND enabled=true", [
      source.connectionId,
    ])
  ).rows[0];
  if (!connection)
    throw new ApiError(
      422,
      "SOURCE_UNAVAILABLE",
      "The registered data source is unavailable",
    );
  const base = validateOrigin(connection.base_url, config);
  const { url, body } = buildRequestUrl(base, source, memberId, assessmentDate);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(
      (x) =>
        addressClass(x.address) === "forbidden" ||
        (addressClass(x.address) === "private" &&
          !config.sourceAllowPrivateOrigins.includes(url.origin)),
    )
  )
    throw new ApiError(
      422,
      "SOURCE_ADDRESS_BLOCKED",
      "Source resolved to an address not allowed by server policy",
    );
  const pinned = addresses[0]!;
  const headers: Record<string, string> = { accept: "application/json" };
  if (body) {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  if (connection.credential_ref) {
    if (!config.sourceCredentialRefs.includes(connection.credential_ref))
      throw new ApiError(
        422,
        "SOURCE_CREDENTIAL_UNAVAILABLE",
        "Source credential is not configured",
      );
    const secret = process.env[connection.credential_ref];
    if (!secret)
      throw new ApiError(
        422,
        "SOURCE_CREDENTIAL_UNAVAILABLE",
        "Source credential is not configured",
      );
    headers.authorization = `Bearer ${secret}`;
  }
  const started = Date.now();
  const text = await new Promise<string>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: source.method,
        headers,
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all)
            callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
      },
      (response) => {
        if (
          (response.statusCode ?? 0) < 200 ||
          (response.statusCode ?? 0) >= 300
        ) {
          response.resume();
          reject(
            new ApiError(
              422,
              "SOURCE_HTTP_ERROR",
              `Source returned HTTP ${response.statusCode ?? "unknown"}`,
            ),
          );
          return;
        }
        if (
          !response.headers["content-type"]
            ?.toLowerCase()
            .includes("application/json")
        ) {
          response.resume();
          reject(
            new ApiError(
              422,
              "SOURCE_INVALID_RESPONSE",
              "Source must return application/json",
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > config.maxSourceBytes) {
            reject(
              new ApiError(
                422,
                "SOURCE_TOO_LARGE",
                "Source response exceeds the configured size limit",
              ),
            );
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf8")),
        );
        response.on("error", reject);
      },
    );
    request.setTimeout(config.sourceTimeoutMs, () =>
      request.destroy(new Error("Source timeout")),
    );
    const deadline = setTimeout(
      () => request.destroy(new Error("Source deadline exceeded")),
      config.sourceTimeoutMs,
    );
    request.once("close", () => clearTimeout(deadline));
    request.on("error", () =>
      reject(
        new ApiError(
          422,
          "SOURCE_UNAVAILABLE",
          "Source connection failed or timed out",
        ),
      ),
    );
    if (body) request.write(body);
    request.end();
  });
  let response: unknown;
  try {
    response = JSON.parse(text);
  } catch {
    throw new ApiError(
      422,
      "SOURCE_INVALID_RESPONSE",
      "Source did not return valid JSON",
    );
  }
  return {
    sourceResponse: response,
    provenance: {
      connectionId: connection.id,
      connectionName: connection.name,
      origin: url.origin,
      operation: source.path,
      retrievedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      responseSha256: createHash("sha256").update(text).digest("hex"),
    },
  };
}
