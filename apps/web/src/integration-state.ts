export type IntakeSource = "demo" | "rest";
export type SyncCounts = {
  created: number;
  updated: number;
  unchanged: number;
  documentsQueued: number;
  documentsUnchanged: number;
};
export type SyncMember = {
  memberId: string;
  name: string;
  action: "CREATE" | "UPDATE" | "UNCHANGED";
  changedFields: string[];
  fieldChanges?: Array<{
    field: string;
    before: string | number | boolean | null;
    after: string | number | boolean | null;
  }>;
  fieldChangesTruncated?: boolean;
};
export type SyncDocument = {
  reference: string;
  memberId: string;
  title: string;
  action: "QUEUE" | "UNCHANGED";
};
export type SyncPreview = {
  previewId: string;
  expiresAt: string;
  records: SyncMember[];
  documents: SyncDocument[];
  changes: SyncCounts;
  impactPlan: string[];
};
export type SyncAssessment = {
  memberId: string;
  ruleName: string;
  evaluationId: string;
  status: string;
};
export type SyncAssessmentResult = {
  runId: string;
  items: SyncAssessment[];
  errors: Array<{ memberId: string; ruleName: string; message: string }>;
  alreadyAssessed: number;
  remaining: number;
  partial: boolean;
  assessmentMode: "fresh-rest";
};
export type SyncRun = {
  id: string;
  source: string;
  status: string;
  createdAt: string;
  createdBy: string;
  summary: SyncCounts;
};
export type SyncRunDetail = SyncRun & {
  records: SyncMember[];
  documents: SyncDocument[];
  assessments: SyncAssessment[];
  impactPlan: string[];
  provenance?: {
    connectionId?: string;
    connectionName?: string;
    origin?: string;
    operation?: string;
    retrievedAt?: string;
    durationMs?: number;
    responseSha256?: string;
  };
};
export function intakeRequest(
  source: IntakeSource,
  scenarioId: string,
  connectionId: string,
  path: string,
) {
  return source === "demo"
    ? { source, scenarioId }
    : { source, connectionId, path: path.trim() };
}
export function previewExpired(
  preview: Pick<SyncPreview, "expiresAt">,
  at = Date.now(),
) {
  const expiresAt = new Date(preview.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= at;
}
export function syncRunPath(id: string) {
  return `/integrations/runs/${encodeURIComponent(id)}`;
}
export function syncFieldValue(value: string | number | boolean | null) {
  return value === null
    ? "Not provided"
    : value === ""
      ? "Empty value"
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
}
export function mergeAssessmentResults(
  existing: SyncAssessment[],
  incoming: SyncAssessment[],
) {
  return [
    ...new Map(
      [...existing, ...incoming].map((item) => [item.evaluationId, item]),
    ).values(),
  ];
}
