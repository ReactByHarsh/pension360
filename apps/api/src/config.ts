export interface Config {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  devAuthSecret: string;
  oidcIssuer?: string;
  oidcAudience?: string;
  oidcJwksUri?: string;
  oidcBootstrapSuperAdminSubject?: string;
  sourceAllowedOrigins: string[];
  sourceAllowPrivateOrigins: string[];
  sourceAllowHttpOrigins: string[];
  sourceCredentialRefs: string[];
  sourceTimeoutMs: number;
  maxSourceBytes: number;
  trustProxy: boolean;
  [key: string]: unknown;
}
function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = (env.NODE_ENV ?? "development") as Config["env"];
  if (!["development", "test", "production"].includes(mode))
    throw new Error("Invalid NODE_ENV");
  const port = Number(env.PORT ?? 4000);
  const demoOrigin = `http://127.0.0.1:${port}`;
  const config: Config = {
    env: mode,
    port,
    databaseUrl:
      env.DATABASE_URL ??
      "postgres://pension360:pension360@127.0.0.1:5432/pension360",
    devAuthSecret:
      env.DEV_AUTH_SECRET ??
      "local-development-only-not-for-production-rotate-this",
    oidcIssuer: env.OIDC_ISSUER,
    oidcAudience: env.OIDC_AUDIENCE,
    oidcJwksUri: env.OIDC_JWKS_URI,
    oidcBootstrapSuperAdminSubject:
      env.OIDC_BOOTSTRAP_SUPER_ADMIN_SUBJECT || undefined,
    sourceAllowedOrigins: csv(
      env.SOURCE_ALLOWED_ORIGINS ?? (mode !== "production" ? demoOrigin : ""),
    ),
    sourceAllowPrivateOrigins: csv(
      env.SOURCE_ALLOW_PRIVATE_ORIGINS ??
        (mode !== "production" ? demoOrigin : ""),
    ),
    sourceAllowHttpOrigins: csv(
      env.SOURCE_ALLOW_HTTP_ORIGINS ??
        (mode !== "production" ? demoOrigin : ""),
    ),
    sourceCredentialRefs: csv(env.SOURCE_CREDENTIAL_REFS),
    sourceTimeoutMs: Number(env.SOURCE_TIMEOUT_MS ?? 10000),
    maxSourceBytes: 2 * 1024 * 1024,
    trustProxy: env.TRUST_PROXY === "true",
  };
  if (mode === "production") {
    if (!config.oidcIssuer || !config.oidcAudience || !config.oidcJwksUri)
      throw new Error("Production requires OIDC issuer, audience and JWKS URI");
    for (const value of [config.oidcIssuer, config.oidcJwksUri])
      if (new URL(value).protocol !== "https:")
        throw new Error("Production OIDC endpoints require HTTPS");
    if (!env.DATABASE_URL)
      throw new Error("Production DATABASE_URL is required");
  }
  if (
    config.oidcBootstrapSuperAdminSubject !== undefined &&
    (config.oidcBootstrapSuperAdminSubject.length < 1 ||
      config.oidcBootstrapSuperAdminSubject.length > 255 ||
      config.oidcBootstrapSuperAdminSubject !==
        config.oidcBootstrapSuperAdminSubject.trim() ||
      /[\u0000-\u001f\u007f]/.test(config.oidcBootstrapSuperAdminSubject))
  )
    throw new Error(
      "OIDC_BOOTSTRAP_SUPER_ADMIN_SUBJECT must be an exact nonempty subject of at most 255 characters",
    );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  if (
    !Number.isInteger(config.sourceTimeoutMs) ||
    config.sourceTimeoutMs < 100 ||
    config.sourceTimeoutMs > 60000
  )
    throw new Error("SOURCE_TIMEOUT_MS must be between 100 and 60000");
  return config;
}
