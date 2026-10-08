import type { Express, Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireRole, userOf } from "./auth.js";
import { ApiError } from "./errors.js";
import { audit } from "./db.js";
import { demoRules, expressionGraph, CONNECTION_ID } from "./seed.js";
import { evaluateRule, getRule, ruleDto } from "./rules.js";
import { uuidSchema } from "./validation.js";
import type { Deps, Evaluation, RuleConfig, Scenario } from "./types.js";

/** Additive exercises: source records, existing graphs and published rules are never changed. */
export interface ExerciseScenario extends Scenario {
  explanation: string;
  expectedOutput?: Record<string, unknown>;
  expectedIssueCodes?: string[];
}
export interface RuleExercise {
  id: string;
  title: string;
  summary: string;
  sourceKind: "stored-members" | "isolated-fixture";
  learning: string[];
  config: RuleConfig;
  scenarios: ExerciseScenario[];
}
type Fixture = { statusCode: number; body: Record<string, any> };
const AS_OF = "2026-10-06";
const unavailable = ["SOURCE_HTTP_ERROR"];
const scenario = (id: string, name: string, memberId: string, expectedStatus: Scenario["expectedStatus"], explanation: string, expectedOutput?: Record<string, unknown>, expectedIssueCodes?: string[]): ExerciseScenario => ({
  id, name, memberId, expectedStatus, assessmentDate: AS_OF, explanation, expectedOutput, expectedIssueCodes,
});
const expr = (id: string, name: string, x: number, y: number, expressions: Array<{ key: string; value: string }>, passThrough = false) => ({
  id, name, type: "expressionNode", position: { x, y }, content: {
    passThrough, inputField: null, outputPath: null, executionMode: "single",
    expressions: expressions.map((e, i) => ({ id: `${id}-${i}`, ...e })),
  },
});

/** Executable switch branches, visible/editable in the existing GoRules designer. */
export function paymentRoutingGraph(): Record<string, unknown> {
  const routeNode = (id: string, y: number, status: string, route: string, reason: string) => expr(id, route.replaceAll("_", " "), 870, y, [
    { key: "status", value: JSON.stringify(status) },
    { key: "route", value: JSON.stringify(route) },
    { key: "differenceBaisa", value: "differenceBaisa" },
    { key: "requiresSeniorReview", value: route === "SENIOR_REVIEW" ? "true" : "false" },
    { key: "reason", value: JSON.stringify(reason) },
  ]);
  return {
    nodes: [
      { id: "input", name: "Mapped payment facts", type: "inputNode", position: { x: 40, y: 240 } },
      expr("difference", "Compute difference in baisa", 300, 240, [{ key: "differenceBaisa", value: "proposedBaisa - approvedBaisa - adjustmentBaisa" }], true),
      { id: "route", name: "Payment review branches", type: "switchNode", position: { x: 590, y: 240 }, content: { hitPolicy: "first", statements: [
        { id: "invalid", condition: "proposedBaisa < 0 or approvedBaisa < 0 or toleranceBaisa < 0 or floor(proposedBaisa) != proposedBaisa or floor(approvedBaisa) != approvedBaisa or floor(adjustmentBaisa) != adjustmentBaisa or floor(toleranceBaisa) != toleranceBaisa", isDefault: false },
        { id: "clear", condition: "abs(differenceBaisa) <= toleranceBaisa", isDefault: false },
        { id: "senior", condition: "abs(differenceBaisa) >= 100000", isDefault: false },
        { id: "review", condition: "", isDefault: true },
      ] } },
      routeNode("invalid-result", 0, "UNABLE_TO_EVALUATE", "SOURCE_CORRECTION", "Amounts must be whole baisa; proposed, approved and tolerance amounts cannot be negative"),
      routeNode("clear-result", 180, "CLEAR", "RECONCILED", "Difference is within the configured tolerance"),
      routeNode("senior-result", 360, "FINDING", "SENIOR_REVIEW", "Difference of at least OMR 100 requires senior review in this fictional exercise"),
      routeNode("review-result", 540, "FINDING", "OFFICER_REVIEW", "Difference exceeds tolerance and needs evidence review"),
      { id: "output", name: "Traceable review outcome", type: "outputNode", position: { x: 1180, y: 240 } },
    ],
    edges: [
      { id: "input-difference", sourceId: "input", targetId: "difference", type: "edge" },
      { id: "difference-route", sourceId: "difference", targetId: "route", type: "edge" },
      ...["invalid", "clear", "senior", "review"].flatMap((branch) => [
        { id: `${branch}-branch`, sourceId: "route", sourceHandle: branch, targetId: `${branch}-result`, type: "edge" },
        { id: `${branch}-output`, sourceId: `${branch}-result`, targetId: "output", type: "edge" },
      ]),
    ],
  };
}
function fixtureBase(memberId: string): Record<string, any> {
  return {
    fictional: true, isolatedExercise: true, memberId,
    person: { name: `Fictional exercise ${memberId}`, dateOfBirth: "1966-10-06" },
    pension: { joiningDate: "1990-01-01", serviceVerified: true },
    employer: { joiningDate: "1990-01-01" }, documents: { missingCount: 0 },
    payment: { proposedBaisa: 650000, approvedBaisa: 650000, authorizedAdjustmentBaisa: 0, toleranceBaisa: 0 },
    contribution: { expectedBaisa: 120000, receivedBaisa: 120000 },
    service: { overlapMonths: 0, unverifiedMonths: 0 },
  };
}

/** Deterministic API fixtures, independent of the customer's stored source_data. */
export function exerciseFixture(exerciseId: string, memberId: string): Fixture | undefined {
  const b = fixtureBase(memberId);
  const fixture = (statusCode = 200): Fixture => ({ statusCode, body: b });
  if (exerciseId === "payment-routing") {
    switch (memberId) {
      case "M001": b.payment.proposedBaisa = 950000; break;
      case "M002": b.payment.proposedBaisa = 750000; break;
      case "M003": b.payment.proposedBaisa = 749999; break;
      case "M004": b.payment.proposedBaisa = 650100; b.payment.toleranceBaisa = 100; break;
      case "M005": b.payment.proposedBaisa = 650101; b.payment.toleranceBaisa = 100; break;
      case "M006": b.payment.proposedBaisa = 700000; b.payment.authorizedAdjustmentBaisa = 50000; break;
      case "M007": b.payment.proposedBaisa = 550000; break;
      case "M008": b.payment.toleranceBaisa = -1; break;
      case "M009": delete b.payment.approvedBaisa; break;
      case "M010": b.payment.proposedBaisa = 650000.5; break;
      case "M011": b.error = "Fictional payment source unavailable"; return fixture(503);
      case "M012": b.payment.proposedBaisa = "unknown"; break;
      default: return undefined;
    }
    return fixture();
  }
  if (exerciseId === "readiness-boundaries") {
    switch (memberId) {
      case "M001": break;
      case "M002": b.employer.joiningDate = "1990-02-01"; break;
      case "M003": b.documents.missingCount = 1; break;
      case "M004": b.pension.serviceVerified = false; break;
      case "M005": delete b.person.dateOfBirth; break;
      case "M006": b.person.dateOfBirth = "1966-02-30"; break;
      case "M007": b.person.dateOfBirth = "2026-10-07"; break;
      case "M008": b.documents.missingCount = -1; break;
      case "M009": b.person.dateOfBirth = "1966-10-07"; break;
      case "M010": b.pension.serviceVerified = "true"; break;
      default: return undefined;
    }
    return fixture();
  }
  if (exerciseId === "contribution-boundaries") {
    switch (memberId) {
      case "M001": break;
      case "M002": b.contribution.receivedBaisa = 90000; break;
      case "M003": b.contribution.receivedBaisa = 150000; break;
      case "M004": b.contribution.expectedBaisa = 0; b.contribution.receivedBaisa = 0; break;
      case "M005": b.contribution.receivedBaisa = -1; break;
      case "M006": delete b.contribution.expectedBaisa; break;
      case "M007": b.contribution.receivedBaisa = 120000.5; break;
      case "M008": b.error = "Fictional contribution source unavailable"; return fixture(503);
      default: return undefined;
    }
    return fixture();
  }
  if (exerciseId === "service-boundaries") {
    switch (memberId) {
      case "M001": break;
      case "M002": b.service.overlapMonths = 3; break;
      case "M003": b.service.unverifiedMonths = 6; break;
      case "M004": b.service.overlapMonths = 3; b.service.unverifiedMonths = 6; break;
      case "M005": b.service.overlapMonths = -1; break;
      case "M006": delete b.service.unverifiedMonths; break;
      case "M007": b.service.unverifiedMonths = 0.5; break;
      case "M008": b.error = "Fictional service source unavailable"; return fixture(503);
      default: return undefined;
    }
    return fixture();
  }
  return undefined;
}

export function ruleExercises(): RuleExercise[] {
  const models = demoRules();
  const result: RuleExercise[] = models.map((config) => {
    const scenarios: ExerciseScenario[] = config.scenarios.map((s) => ({ ...s, assessmentDate: AS_OF, explanation: s.name }));
    for (const s of scenarios) {
      if (s.expectedStatus === "UNABLE_TO_EVALUATE") s.expectedIssueCodes = unavailable;
      if (config.module === "payment") s.expectedOutput = { differenceBaisa: s.memberId === "M005" ? 300000 : 0 };
      if (config.module === "contribution") s.expectedOutput = { differenceBaisa: s.memberId === "M007" ? 30000 : 0 };
    }
    if (config.module !== "readiness") scenarios.push(scenario("outage", "Unavailable employer source", "M004", "UNABLE_TO_EVALUATE", "Source HTTP 503 must remain an evidence failure, never a business pass.", undefined, unavailable));
    return {
      id: `${config.module}-members`, title: config.name,
      summary: `Run the existing ${config.module} demonstration model against current stored fictional member records. Changes to those records can legitimately change these results.`,
      sourceKind: "stored-members", learning: ["Fetch actual configured REST response", "Inspect mapped facts and native engine trace", "Compare expectations without changing published rules or member facts"],
      config: { ...config, scenarios }, scenarios,
    };
  });
  function isolated(id: string, module: RuleConfig["module"], title: string, summary: string, graph: Record<string, unknown>, scenarios: ExerciseScenario[], learning: string[]) {
    const original = models.find((r) => r.module === module)!;
    result.push({ id, title, summary, sourceKind: "isolated-fixture", learning,
      config: { ...structuredClone(original), name: title, graph, source: { ...original.source, path: `/demo-source/exercises/${id}/{memberId}` }, scenarios }, scenarios });
  }
  isolated("payment-routing", "payment", "Payment tolerance and senior-review branches", "A real switch graph routes reconciled, officer-review, senior-review and invalid-data outcomes. The OMR 100 threshold is fictional.", paymentRoutingGraph(), [
    scenario("large", "OMR 300 unexplained difference", "M001", "FINDING", "300,000 baisa follows senior review.", { differenceBaisa: 300000, route: "SENIOR_REVIEW", requiresSeniorReview: true }),
    scenario("at-senior", "Exactly OMR 100", "M002", "FINDING", "Inclusive senior boundary.", { differenceBaisa: 100000, route: "SENIOR_REVIEW", requiresSeniorReview: true }),
    scenario("below-senior", "One baisa below OMR 100", "M003", "FINDING", "99,999 baisa follows officer review.", { differenceBaisa: 99999, route: "OFFICER_REVIEW", requiresSeniorReview: false }),
    scenario("at-tolerance", "Exactly 100-baisa tolerance", "M004", "CLEAR", "At the tolerance is reconciled.", { differenceBaisa: 100, route: "RECONCILED" }),
    scenario("over-tolerance", "One baisa over tolerance", "M005", "FINDING", "101 exceeds the 100-baisa tolerance.", { differenceBaisa: 101, route: "OFFICER_REVIEW" }),
    scenario("adjusted", "Authorized adjustment", "M006", "CLEAR", "700,000 − 650,000 − 50,000 = 0.", { differenceBaisa: 0, route: "RECONCILED" }),
    scenario("negative-difference", "Proposed below approved", "M007", "FINDING", "Absolute difference routes a shortfall too.", { differenceBaisa: -100000, route: "SENIOR_REVIEW" }),
    scenario("negative-tolerance", "Invalid negative tolerance", "M008", "UNABLE_TO_EVALUATE", "Bad financial input cannot be treated as a confirmed discrepancy.", { route: "SOURCE_CORRECTION" }),
    scenario("missing-approval", "Missing approved amount", "M009", "UNABLE_TO_EVALUATE", "Required mapping stops execution.", undefined, ["MISSING_REQUIRED_FIELD"]),
    scenario("fractional-baisa", "Fractional baisa", "M010", "UNABLE_TO_EVALUATE", "Amounts must use whole baisa.", { route: "SOURCE_CORRECTION" }),
    scenario("source-outage", "HTTP source unavailable", "M011", "UNABLE_TO_EVALUATE", "Fetch fails before graph execution.", undefined, unavailable),
    scenario("invalid-number", "Nonnumeric proposed amount", "M012", "UNABLE_TO_EVALUATE", "Invalid source type must not become zero.", undefined, ["INVALID_MAPPING_VALUE"]),
  ], ["Change branches in the visual switch grid", "Use source-bound baisa amounts", "Test equality boundaries, shortfalls, invalid types and outages"]);

  const readiness = structuredClone(models.find((r) => r.module === "readiness")!.graph);
  const readinessNodes = readiness.nodes as any[];
  // Preserve normal seed graph; guard the independent boundary exercise against invalid counts.
  readinessNodes.find((n) => n.id === "decision").content.rules.unshift({ _id: "invalid-count", verified: "", missing: "< 0 or floor($) != $", dates: "", status: '"UNABLE_TO_EVALUATE"', reason: '"Missing-document count must be a nonnegative whole number"' });
  isolated("readiness-boundaries", "readiness", "Readiness data contracts and birthday boundaries", "Checks evidence readiness plus required fields, real dates, boolean types and age transformation. Readiness never means pension entitlement.", readiness, [
    scenario("birthday", "Complete on 60th birthday", "M001", "READY_FOR_REVIEW", "DOB maps to age 60; readiness uses evidence checks."),
    scenario("dates", "Joining dates disagree", "M002", "NEEDS_VERIFICATION", "Keep both source dates and request evidence.", { reason: "Joining dates differ between sources" }),
    scenario("missing", "One mandatory document missing", "M003", "NEEDS_VERIFICATION", "Do not proceed with incomplete evidence."),
    scenario("unverified", "Service unverified", "M004", "NEEDS_VERIFICATION", "Do not treat unverified months as verified."),
    scenario("missing-dob", "DOB missing", "M005", "UNABLE_TO_EVALUATE", "Required source data must be present.", undefined, ["MISSING_REQUIRED_FIELD"]),
    scenario("invalid-date", "Impossible calendar date", "M006", "UNABLE_TO_EVALUATE", "February 30 is rejected.", undefined, ["INVALID_MAPPING_VALUE"]),
    scenario("future-dob", "DOB is tomorrow", "M007", "UNABLE_TO_EVALUATE", "Age transform rejects future DOB.", undefined, ["INVALID_MAPPING_VALUE"]),
    scenario("negative-count", "Negative missing count", "M008", "UNABLE_TO_EVALUATE", "A negative evidence count is invalid."),
    scenario("before-birthday", "Day before 60th birthday", "M009", "READY_FOR_REVIEW", "DOB maps to age 59. No statutory age rule is implied."),
    scenario("string-boolean", "String instead of boolean", "M010", "UNABLE_TO_EVALUATE", "Literal true text cannot silently become boolean true.", undefined, ["INVALID_MAPPING_VALUE"]),
  ], ["Read age from mapped DOB at the assessment date", "Inspect actual mapping issues", "Separate data validity from business readiness"]);
  const contributionValid = "expectedBaisa >= 0 and receivedBaisa >= 0 and floor(expectedBaisa) == expectedBaisa and floor(receivedBaisa) == receivedBaisa";
  isolated("contribution-boundaries", "contribution", "Contribution receipt boundaries", "Whole-baisa reconciliation catches underpayments, excess receipts and invalid source amounts.", expressionGraph([
    { key: "differenceBaisa", value: "expectedBaisa - receivedBaisa" },
    { key: "status", value: `not (${contributionValid}) ? "UNABLE_TO_EVALUATE" : (expectedBaisa == receivedBaisa ? "CLEAR" : "FINDING")` },
    { key: "reason", value: `not (${contributionValid}) ? "Source amounts must be nonnegative whole baisa" : (expectedBaisa == receivedBaisa ? "Contributions reconcile" : "Contribution difference requires reconciliation")` },
  ]), [
    scenario("matched", "Matching receipt", "M001", "CLEAR", "120,000 expected equals 120,000 received.", { differenceBaisa: 0 }),
    scenario("under", "OMR 30 shortfall", "M002", "FINDING", "Expected less received is +30,000 baisa.", { differenceBaisa: 30000 }),
    scenario("over", "OMR 30 excess receipt", "M003", "FINDING", "Expected less received is −30,000 baisa.", { differenceBaisa: -30000 }),
    scenario("zero", "Both supplied amounts zero", "M004", "CLEAR", "Compares supplied amounts; this is not proof a period was due.", { differenceBaisa: 0 }),
    scenario("negative", "Negative receipt", "M005", "UNABLE_TO_EVALUATE", "Reject invalid input before a business finding."),
    scenario("missing", "Expected amount missing", "M006", "UNABLE_TO_EVALUATE", "Required value cannot be guessed.", undefined, ["MISSING_REQUIRED_FIELD"]),
    scenario("fractional", "Fractional baisa", "M007", "UNABLE_TO_EVALUATE", "Use integer minor currency units."),
    scenario("outage", "Source unavailable", "M008", "UNABLE_TO_EVALUATE", "No fabricated amount after HTTP failure.", undefined, unavailable),
  ], ["Compare the sign as well as status", "Keep exact integer money units", "Handle missing facts and unavailable sources"]);
  const serviceValid = "overlapMonths >= 0 and unverifiedMonths >= 0 and floor(overlapMonths) == overlapMonths and floor(unverifiedMonths) == unverifiedMonths";
  isolated("service-boundaries", "service", "Service evidence boundaries", "Investigate supplied overlap/unverified months, including both together. Invalid counts remain a source correction.", expressionGraph([
    { key: "status", value: `not (${serviceValid}) ? "UNABLE_TO_EVALUATE" : (overlapMonths > 0 or unverifiedMonths > 0 ? "FINDING" : "CLEAR")` },
    { key: "reason", value: `not (${serviceValid}) ? "Source month counts must be nonnegative whole numbers" : (overlapMonths > 0 and unverifiedMonths > 0 ? "Overlap and unverified months both require investigation" : (overlapMonths > 0 ? "Overlapping service periods require investigation" : (unverifiedMonths > 0 ? "Service months await verification" : "Configured service checks passed")))` },
  ]), [
    scenario("clear", "No supplied exception", "M001", "CLEAR", "Zero overlap and unverified months; not statutory certification."),
    scenario("overlap", "Three overlap months", "M002", "FINDING", "Request employment-period evidence."),
    scenario("unverified", "Six unverified months", "M003", "FINDING", "Request service confirmation."),
    scenario("both", "Overlap and unverified months", "M004", "FINDING", "Both investigation reasons should be visible.", { reason: "Overlap and unverified months both require investigation" }),
    scenario("negative", "Negative overlap count", "M005", "UNABLE_TO_EVALUATE", "Bad data must not appear clear."),
    scenario("missing", "Verification count missing", "M006", "UNABLE_TO_EVALUATE", "An empty service source is not a clean record.", undefined, ["MISSING_REQUIRED_FIELD"]),
    scenario("fractional", "Fractional month count", "M007", "UNABLE_TO_EVALUATE", "This particular configured contract requires whole months."),
    scenario("outage", "Source unavailable", "M008", "UNABLE_TO_EVALUATE", "Retrieve fresh facts after source recovery.", undefined, unavailable),
  ], ["Explain two concurrent exception reasons", "Reject negative/missing counts", "Keep assessment and case approvals separate"]);
  const v2 = structuredClone(result[0]!);
  v2.id = "readiness-post-v2";
  v2.title = "POST lookup with a changed API envelope";
  v2.summary = "Run the same readiness model through the real v2 POST endpoint, using body bindings and /data field mappings.";
  v2.config.name = v2.title;
  v2.config.source = { connectionId: CONNECTION_ID, path: "/demo-source/v2/lookup", method: "POST", bindings: [{ location: "body", key: "memberId", valueFrom: "memberId" }] };
  v2.config.mappings = v2.config.mappings.map((m) => ({ ...m, sourcePath: `/data${m.sourcePath}` }));
  v2.learning = ["Preview an actual POST response", "Map /data/... visually", "Rerun the same scenarios after an API contract change"];
  result.push(v2);
  for (const exercise of result) exercise.config.scenarios = exercise.scenarios.map(({ id, name, memberId, assessmentDate, expectedStatus }) => ({ id, name, memberId, assessmentDate, expectedStatus }));
  return result;
}

export function exerciseAssertions(scenario: ExerciseScenario, evaluation: Evaluation) {
  const checks = [{ field: "status", expected: scenario.expectedStatus as unknown, actual: evaluation.status as unknown, passed: evaluation.status === scenario.expectedStatus }];
  for (const [key, expected] of Object.entries(scenario.expectedOutput ?? {})) checks.push({ field: `output.${key}`, expected, actual: evaluation.output[key], passed: JSON.stringify(evaluation.output[key]) === JSON.stringify(expected) });
  const expectedCodes = [...new Set(scenario.expectedIssueCodes ?? [])].sort();
  const actualCodes = [...new Set(evaluation.issues.map((i) => i.code))].sort();
  checks.push({ field: "issueCodes", expected: expectedCodes, actual: actualCodes, passed: JSON.stringify(expectedCodes) === JSON.stringify(actualCodes) });
  if (scenario.id === "birthday" || scenario.id === "before-birthday") {
    const expected = scenario.id === "birthday" ? 60 : 59;
    checks.push({ field: "input.ageYears", expected, actual: evaluation.input.ageYears, passed: evaluation.input.ageYears === expected });
  }
  return checks;
}
function findExercise(id: string): RuleExercise {
  const exercise = ruleExercises().find((x) => x.id === id);
  if (!exercise) throw new ApiError(404, "NOT_FOUND", "Rule exercise not found");
  return exercise;
}
export function registerRuleExercisePublic(app: Express, deps: Deps): void {
  if (deps.config.env === "production") return;
  app.get("/demo-source/exercises/:exerciseId/:memberId", (req, res) => {
    const exercise = findExercise(String(req.params.exerciseId));
    const fixture = exerciseFixture(exercise.id, String(req.params.memberId));
    if (!fixture) throw new ApiError(404, "NOT_FOUND", "No fixture for this exercise and member reference");
    res.status(fixture.statusCode).json(fixture.body);
  });
}
export function registerRuleExerciseRoutes(router: Router, deps: Deps): void {
  const allowed = requireRole("ADMIN", "DESIGNER", "REVIEWER");
  router.get("/rule-exercises", allowed, (_req, res) => res.json({ items: ruleExercises(), available: deps.config.env !== "production", assessmentDate: AS_OF }));
  router.post("/rule-exercises/:id/run", allowed, async (req, res) => {
    if (deps.config.env === "production") throw new ApiError(404, "NOT_FOUND", "Fictional exercise runs are disabled in production");
    const body = z.object({ ruleId: uuidSchema.optional(), connectionId: uuidSchema.optional(), scenarioIds: z.array(z.string().min(1).max(100)).min(1).max(30).optional() }).strict().parse(req.body ?? {});
    const exercise = findExercise(String(req.params.id));
    if (body.scenarioIds?.some((id) => !exercise.scenarios.some((s) => s.id === id))) throw new ApiError(400, "UNKNOWN_SCENARIO", "Choose a scenario from this exercise");
    if (body.ruleId && body.connectionId) throw new ApiError(400, "AMBIGUOUS_CONFIGURATION", "A saved model uses its own source connection");
    const candidate = body.ruleId ? await getRule(deps.pool, body.ruleId) : null;
    if (candidate && candidate.module !== exercise.config.module) throw new ApiError(400, "MODULE_MISMATCH", "Choose a saved model from the exercise module");
    const config = candidate ? ruleDto(candidate) : { ...exercise.config, source: { ...exercise.config.source, connectionId: body.connectionId ?? exercise.config.source.connectionId } };
    const row = candidate ?? { ...config, id: randomUUID(), version: 1, family_id: randomUUID(), effective_from: config.effectiveFrom, effective_to: config.effectiveTo ?? null };
    const selected = exercise.scenarios.filter((s) => !body.scenarioIds || body.scenarioIds.includes(s.id));
    const results = [];
    const start = Date.now();
    for (const scenario of selected) {
      const began = Date.now();
      const evaluation = await evaluateRule(deps.pool, deps, row, scenario.memberId, scenario.assessmentDate, userOf(req), true, false);
      const checks = exerciseAssertions(scenario, evaluation);
      results.push({ scenarioId: scenario.id, name: scenario.name, memberId: scenario.memberId, passed: checks.every((c) => c.passed), checks, evaluation, durationMs: Date.now() - began });
    }
    const report = { id: randomUUID(), exerciseId: exercise.id, title: exercise.title, ruleId: candidate?.id ?? null, mode: candidate ? "saved-model-simulation" : "catalog-simulation", generatedAt: new Date().toISOString(), durationMs: Date.now() - start, passed: results.every((r) => r.passed), passedCount: results.filter((r) => r.passed).length, total: results.length, results };
    await audit(deps.pool, userOf(req), "RULE_EXERCISE_RUN", "rule_exercise", exercise.id, { reportId: report.id, ruleId: report.ruleId, passed: report.passed, passedCount: report.passedCount, total: report.total }, req.requestId);
    res.json(report);
  });
}
