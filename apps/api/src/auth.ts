import type { RequestHandler } from "express";
import {
  SignJWT,
  jwtVerify,
  createRemoteJWKSet,
  type RemoteJWKSetOptions,
} from "jose";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { ApiError } from "./errors.js";
import { userOf } from "./db.js";
import { ROLES, type Role, type User } from "./types.js";
import {
  bootstrapIdentity,
  DEMO_USERS,
  identityId,
  registeredUser,
  seedDemoUsers,
} from "./access.js";
export { userOf } from "./db.js";
export { DEMO_USERS } from "./access.js";
export async function devToken(
  config: Config,
  userId: string,
  pool?: Pool,
): Promise<{ accessToken: string; user: User }> {
  if (config.env === "production")
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  let user = DEMO_USERS.find((x) => x.id === userId);
  if (!user)
    throw new ApiError(400, "INVALID_USER", "Select a known development user");
  if (pool) {
    await seedDemoUsers(pool);
    const current = await registeredUser(pool, userId);
    if (!current?.active)
      throw new ApiError(
        403,
        "INACTIVE_USER",
        "This development identity is inactive",
      );
    user = current.user;
  }
  const accessToken = await new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("pension360-development")
    .setAudience("pension360")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(config.devAuthSecret));
  return { accessToken, user };
}
export function authenticate(
  config: Config,
  pool?: Pool,
  jwksOptions?: RemoteJWKSetOptions,
): RequestHandler {
  const jwks =
    config.env === "production"
      ? createRemoteJWKSet(new URL(config.oidcJwksUri!), jwksOptions)
      : null;
  return async (req, _res, next) => {
    try {
      const header = req.get("authorization");
      if (!header?.startsWith("Bearer ")) throw new Error("Missing bearer");
      const { payload } = jwks
        ? await jwtVerify(header.slice(7), jwks, {
            issuer: config.oidcIssuer,
            audience: config.oidcAudience,
            algorithms: ["RS256", "ES256"],
            requiredClaims: ["sub", "exp", "iat"],
          })
        : await jwtVerify(
            header.slice(7),
            new TextEncoder().encode(config.devAuthSecret),
            {
              issuer: "pension360-development",
              audience: "pension360",
              algorithms: ["HS256"],
              requiredClaims: ["sub", "exp", "iat"],
            },
          );
      const subject = identityId.parse(payload.sub);
      if (pool) {
        const current = await registeredUser(pool, subject);
        if (current) {
          if (!current.active) throw new Error("Inactive identity");
          req.user = current.user;
          next();
          return;
        }
      }
      if (config.env === "production") {
        if (!pool) throw new Error("Production user directory is required");
        if (subject !== config.oidcBootstrapSuperAdminSubject)
          throw new Error("Unregistered identity");
        const bootstrapped = await bootstrapIdentity(
          pool,
          subject,
          typeof payload.name === "string" && payload.name.trim()
            ? payload.name.trim().slice(0, 200)
            : subject.slice(0, 200),
        );
        if (!bootstrapped) throw new Error("Bootstrap unavailable");
        req.user = bootstrapped;
        next();
        return;
      }
      // Development accepts only the fixed fictional identities. Test fixtures may
      // explicitly sign additional identities; no such fallback exists in production.
      if (
        (config.env !== "test" &&
          !DEMO_USERS.some((user) => user.id === subject)) ||
        typeof payload.role !== "string" ||
        !ROLES.includes(payload.role as Role)
      )
        throw new Error("Invalid claims");
      req.user = {
        id: subject,
        name: typeof payload.name === "string" ? payload.name : subject,
        role: payload.role as Role,
      };
      next();
    } catch {
      next(
        new ApiError(
          401,
          "UNAUTHENTICATED",
          "A valid sign-in token is required",
        ),
      );
    }
  };
}
/** Super administrators inherit administrative capabilities, never actor-based approval exemptions. */
export function hasRole(role: Role, ...roles: Role[]): boolean {
  return (
    roles.includes(role) || (role === "SUPER_ADMIN" && roles.includes("ADMIN"))
  );
}
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = userOf(req);
    if (!hasRole(user.role, ...roles))
      return next(
        new ApiError(403, "FORBIDDEN", "Your role does not permit this action"),
      );
    next();
  };
}
