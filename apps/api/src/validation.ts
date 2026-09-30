import { z } from "zod";
import { validDate } from "./source.js";
export const dateSchema = z
  .string()
  .refine(validDate, "Use a real date in YYYY-MM-DD format");
export const uuidSchema = z.string().uuid();
export const memberIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const evaluationInputSchema = z
  .object({ memberId: memberIdSchema, assessmentDate: dateSchema })
  .strict();
export const revisionSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const statusSchema = z.enum([
  "READY_FOR_REVIEW",
  "NEEDS_VERIFICATION",
  "UNABLE_TO_EVALUATE",
  "CLEAR",
  "FINDING",
]);
export const sourceSchema = z
  .object({
    connectionId: uuidSchema,
    path: z.string().min(1).max(500),
    method: z.enum(["GET", "POST"]),
    bindings: z
      .array(
        z
          .object({
            location: z.enum(["path", "query", "body"]),
            key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
            valueFrom: z.enum(["memberId", "assessmentDate", "constant"]),
            constant: z.string().max(500).optional(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export const mappingSchema = z
  .object({
    id: z.string().min(1).max(100),
    sourcePath: z
      .string()
      .max(500)
      .refine(
        (x) =>
          x.startsWith("/") &&
          !x
            .split("/")
            .some((k) => ["__proto__", "prototype", "constructor"].includes(k)),
        "Use a safe JSON Pointer",
      ),
    targetPath: z
      .string()
      .max(200)
      .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/)
      .refine(
        (x) =>
          !x
            .split(".")
            .some((k) => ["__proto__", "prototype", "constructor"].includes(k)),
        "Unsafe target",
      ),
    type: z.enum(["string", "number", "boolean", "date"]),
    required: z.boolean(),
    transform: z.enum(["identity", "ageYears", "serviceYears"]),
  })
  .strict();
export const ruleSchema = z
  .object({
    name: z.string().trim().min(3).max(200),
    module: z.enum(["readiness", "contribution", "payment", "service"]),
    graph: z.record(z.string(), z.unknown()),
    source: sourceSchema,
    mappings: z.array(mappingSchema).min(1).max(100),
    scenarios: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            name: z.string().trim().min(1).max(200),
            memberId: memberIdSchema,
            assessmentDate: dateSchema,
            expectedStatus: statusSchema,
          })
          .strict(),
      )
      .max(30),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (x) => !x.effectiveTo || x.effectiveTo >= x.effectiveFrom,
    "Effective end cannot precede start",
  )
  .refine(
    (x) =>
      new Set(x.mappings.map((m) => m.targetPath)).size === x.mappings.length,
    "Target mappings must be unique",
  )
  .refine(
    (x) => new Set(x.scenarios.map((s) => s.id)).size === x.scenarios.length,
    "Scenario IDs must be unique",
  );
