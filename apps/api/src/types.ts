import type { Pool } from "pg";
import type { Config } from "./config.js";

export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "OFFICER",
  "REVIEWER",
  "DESIGNER",
  "AUDITOR",
] as const;
export type Role = (typeof ROLES)[number];
export interface User {
  id: string;
  name: string;
  role: Role;
}
export interface Deps {
  config: Config;
  pool: Pool;
}
declare global {
  namespace Express {
    interface Request {
      user?: User;
      requestId: string;
    }
  }
}
export interface Binding {
  location: "path" | "query" | "body";
  key: string;
  valueFrom: "memberId" | "assessmentDate" | "constant";
  constant?: string;
}
export interface Source {
  connectionId: string;
  path: string;
  method: "GET" | "POST";
  bindings: Binding[];
}
export interface Mapping {
  id: string;
  sourcePath: string;
  targetPath: string;
  type: "string" | "number" | "boolean" | "date";
  required: boolean;
  transform: "identity" | "ageYears" | "serviceYears";
}
export interface Scenario {
  id: string;
  name: string;
  memberId: string;
  assessmentDate: string;
  expectedStatus: EvaluationStatus;
}
export type EvaluationStatus =
  | "READY_FOR_REVIEW"
  | "NEEDS_VERIFICATION"
  | "UNABLE_TO_EVALUATE"
  | "CLEAR"
  | "FINDING";
export interface RuleConfig {
  name: string;
  module: "readiness" | "contribution" | "payment" | "service";
  graph: Record<string, unknown>;
  source: Source;
  mappings: Mapping[];
  scenarios: Scenario[];
  effectiveFrom: string;
  effectiveTo?: string | null;
}
export interface Issue {
  code: string;
  message: string;
  field?: string;
}
export interface Evaluation {
  id: string;
  ruleId: string;
  memberId: string;
  assessmentDate: string;
  status: EvaluationStatus;
  output: Record<string, unknown>;
  input: Record<string, unknown>;
  trace: unknown;
  sourceResponse: unknown;
  provenance: Record<string, unknown>;
  issues: Issue[];
  createdAt: string;
  caseId?: string;
}
