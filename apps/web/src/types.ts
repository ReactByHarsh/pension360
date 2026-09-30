export type Role =
  "SUPER_ADMIN" | "ADMIN" | "OFFICER" | "REVIEWER" | "DESIGNER" | "AUDITOR";
export type User = { id: string; name: string; role: Role };
export type Connection = {
  id: string;
  name: string;
  baseUrl: string;
  credentialRef?: string;
  enabled: boolean;
};
export type Binding = {
  location: "path" | "query" | "body";
  key: string;
  valueFrom: "memberId" | "assessmentDate";
  constant?: string;
};
export type Source = {
  connectionId: string;
  path: string;
  method: "GET" | "POST";
  bindings: Binding[];
};
export type Mapping = {
  id: string;
  sourcePath: string;
  targetPath: string;
  type: "string" | "number" | "boolean" | "date";
  required: boolean;
  transform: "identity" | "ageYears" | "serviceYears";
};
export type Scenario = {
  id: string;
  name: string;
  memberId: string;
  assessmentDate: string;
  expectedStatus: string;
};
export type Graph = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};
export type Rule = {
  id: string;
  name: string;
  module: "readiness" | "contribution" | "payment" | "service";
  version: number;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "RETIRED";
  revision: number;
  graph: Graph;
  source: Source;
  mappings: Mapping[];
  scenarios: Scenario[];
  effectiveFrom: string;
  effectiveTo?: string;
  createdBy: string;
  authorIds: string[];
  submittedBy?: string | null;
  reviewedBy?: string;
  testHash?: string;
  testPassed?: boolean;
  createdAt: string;
};
export type Member = {
  id: string;
  name: string;
  nameAr?: string;
  organization: string;
  dateOfBirth: string;
  dateOfJoining: string;
  expectedRetirementDate: string;
};
export type Evaluation = {
  id: string;
  ruleId: string;
  memberId: string;
  assessmentDate: string;
  status: string;
  input: unknown;
  output: unknown;
  trace: unknown;
  sourceResponse?: unknown;
  provenance: unknown;
  issues: unknown[];
  createdAt: string;
  caseId?: string;
};
export type CaseRecord = {
  id: string;
  memberId: string;
  title: string;
  category: string;
  status: "OPEN" | "INVESTIGATING" | "IN_REVIEW" | "APPROVED" | "RESOLVED";
  revision: number;
  assignedTo?: string;
  createdBy: string;
  submittedBy?: string;
  notes: Array<{ text: string; createdAt?: string; actor?: string }>;
  evaluationId?: string;
};
export type DocumentField = {
  name: string;
  value: string;
  evidence: { page: number; quote: string };
  uncertain: boolean;
};
export type DocumentRecord = {
  id: string;
  title: string;
  memberId: string;
  status: string;
  revision: number;
  fields: DocumentField[];
  summary?: string;
  mimeType?: string;
  createdAt?: string;
  createdBy?: string;
  uploaderId?: string;
  [key: string]: unknown;
};
export type Policy = {
  id: string;
  createdBy?: string;
  title: string;
  body: string;
  language: string;
  effectiveFrom: string;
  status: string;
};
export type Answer = {
  answer: string;
  citations: unknown[];
  provider: string;
  requiresHumanReview: boolean;
  evidenceCoverage?: {
    page: string;
    memberId: string | null;
    capturedAt: string;
    publishedPolicies: number;
    liveAssessments: number;
    cases: number;
    documents: number;
    forecastSettings: {
      asOfDate: string;
      horizonMonths: number;
      delayMonths: number;
    } | null;
  };
};
export type List<T> = {
  items: T[];
  limit?: number;
  offset?: number;
  total?: number;
  hasMore?: boolean;
};
