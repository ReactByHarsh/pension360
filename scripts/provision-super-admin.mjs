// Bootstrap application authorization only. The identity must already exist in the configured IdP.
// Uses the migration/operator database account, and never prints credentials or the subject.
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: { subject: { type: "string" }, name: { type: "string" } },
  strict: true,
});
if (!values.subject || !values.name) {
  console.error(
    "Usage: node --env-file-if-exists=.env scripts/provision-super-admin.mjs --subject <exact-oidc-subject> --name <display-name>",
  );
  process.exitCode = 1;
} else if (!process.env.MIGRATION_DATABASE_URL && !process.env.DATABASE_URL) {
  console.error(
    "Set MIGRATION_DATABASE_URL or DATABASE_URL for the intended migrated application database.",
  );
  process.exitCode = 1;
} else {
  let pool;
  try {
    const { createPool } = await import("../apps/api/dist/db.js");
    const { bootstrapIdentity, registeredUser, identityId } =
      await import("../apps/api/dist/access.js");
    identityId.parse(values.subject);
    if (!values.name.trim() || values.name.trim().length > 200)
      throw new Error("Display name must contain 1–200 characters.");
    pool = createPool(
      process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
    );
    const existing = await registeredUser(pool, values.subject);
    if (existing) {
      if (!existing.active || existing.user.role !== "SUPER_ADMIN")
        throw new Error(
          "This subject already exists without active Super administrator access. Use the authorised directory workflow; no change was made.",
        );
      console.log(
        "An active Super administrator already exists for that subject. No change was made.",
      );
    } else {
      const user = await bootstrapIdentity(
        pool,
        values.subject,
        values.name.trim(),
        "operator-cli",
      );
      if (!user || user.role !== "SUPER_ADMIN")
        throw new Error(
          "Initial bootstrap is unavailable: the directory is nonempty or bootstrap was already consumed. No change was made.",
        );
      console.log(
        "Initial Super administrator authorization created and audited. Verify sign-in through the configured identity provider.",
      );
    }
  } catch (error) {
    // Avoid raw database/driver diagnostics that may carry connection information.
    console.error(
      error?.code === "ERR_MODULE_NOT_FOUND"
        ? "Build the API before provisioning: npm run build."
        : "User provisioning did not complete. Check the subject, directory state, migrations and operator database access; no credentials are displayed.",
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
