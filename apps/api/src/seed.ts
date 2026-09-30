import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Pool } from "pg";
import { createPool, transaction, audit } from "./db.js";
import { loadConfig } from "./config.js";
import type { RuleConfig, Mapping } from "./types.js";
import { seedDemoPolicies } from "./demo.js";
import { seedDemoUsers } from "./access.js";

export const CONNECTION_ID = "11111111-1111-4111-8111-111111111111";
export function expressionGraph(
  expressions: { key: string; value: string }[],
): Record<string, unknown> {
  return {
    nodes: [
      {
        id: "input",
        name: "REST facts",
        type: "inputNode",
        position: { x: 100, y: 200 },
      },
      {
        id: "decision",
        name: "Approved demonstration checks",
        type: "expressionNode",
        position: { x: 380, y: 200 },
        content: {
          expressions: expressions.map((x, i) => ({ id: `expr-${i}`, ...x })),
          passThrough: false,
          inputField: null,
          outputPath: null,
          executionMode: "single",
        },
      },
      {
        id: "output",
        name: "Assessment",
        type: "outputNode",
        position: { x: 700, y: 200 },
      },
    ],
    edges: [
      {
        id: "edge-input",
        sourceId: "input",
        targetId: "decision",
        type: "edge",
      },
      {
        id: "edge-output",
        sourceId: "decision",
        targetId: "output",
        type: "edge",
      },
    ],
  };
}
export function readinessGraph(): Record<string, unknown> {
  return {
    nodes: [
      {
        id: "input",
        name: "Mapped REST facts",
        type: "inputNode",
        position: { x: 80, y: 220 },
      },
      {
        id: "compare",
        name: "Compare source joining dates",
        type: "expressionNode",
        position: { x: 350, y: 220 },
        content: {
          expressions: [
            {
              id: "matching-dates",
              key: "datesMatch",
              value: "pensionJoiningDate == employerJoiningDate",
            },
          ],
          passThrough: true,
          inputField: null,
          outputPath: null,
          executionMode: "single",
        },
      },
      {
        id: "decision",
        name: "Readiness decision table",
        type: "decisionTableNode",
        position: { x: 640, y: 220 },
        content: {
          hitPolicy: "first",
          passThrough: false,
          inputField: null,
          outputPath: null,
          executionMode: "single",
          inputs: [
            {
              id: "verified",
              name: "Service verified",
              field: "serviceVerified",
              fieldType: { type: "boolean" },
            },
            {
              id: "missing",
              name: "Missing mandatory documents",
              field: "missingDocuments",
              fieldType: { type: "number" },
            },
            {
              id: "dates",
              name: "Joining dates match",
              field: "datesMatch",
              fieldType: { type: "boolean" },
            },
          ],
          outputs: [
            {
              id: "status",
              name: "Review outcome",
              field: "status",
              outputFieldType: {
                type: "string",
                enum: {
                  type: "inline",
                  values: [
                    { label: "Ready for review", value: "READY_FOR_REVIEW" },
                    {
                      label: "Needs verification",
                      value: "NEEDS_VERIFICATION",
                    },
                    {
                      label: "Unable to evaluate",
                      value: "UNABLE_TO_EVALUATE",
                    },
                  ],
                },
              },
            },
            {
              id: "reason",
              name: "Explanation for officer",
              field: "reason",
              outputFieldType: { type: "string" },
            },
          ],
          rules: [
            {
              _id: "dates-differ",
              verified: "",
              missing: "",
              dates: "false",
              status: '"NEEDS_VERIFICATION"',
              reason: '"Joining dates differ between sources"',
            },
            {
              _id: "documents-missing",
              verified: "",
              missing: "> 0",
              dates: "",
              status: '"NEEDS_VERIFICATION"',
              reason: '"Mandatory evidence is missing"',
            },
            {
              _id: "service-unverified",
              verified: "false",
              missing: "",
              dates: "",
              status: '"NEEDS_VERIFICATION"',
              reason: '"Service needs verification"',
            },
            {
              _id: "ready",
              verified: "true",
              missing: "0",
              dates: "true",
              status: '"READY_FOR_REVIEW"',
              reason: '"All configured checks passed"',
            },
            {
              _id: "otherwise",
              verified: "",
              missing: "",
              dates: "",
              status: '"UNABLE_TO_EVALUATE"',
              reason: '"No approved readiness condition matched"',
            },
          ],
        },
      },
      {
        id: "output",
        name: "Evidence-linked review outcome",
        type: "outputNode",
        position: { x: 970, y: 220 },
      },
    ],
    edges: [
      {
        id: "input-compare",
        sourceId: "input",
        targetId: "compare",
        type: "edge",
      },
      {
        id: "compare-table",
        sourceId: "compare",
        targetId: "decision",
        type: "edge",
      },
      {
        id: "table-output",
        sourceId: "decision",
        targetId: "output",
        type: "edge",
      },
    ],
  };
}
function mapping(
  targetPath: string,
  sourcePath: string,
  type: Mapping["type"] = "string",
  transform: Mapping["transform"] = "identity",
): Mapping {
  return {
    id: targetPath,
    sourcePath,
    targetPath,
    type,
    required: true,
    transform,
  };
}
export function demoRules(): RuleConfig[] {
  const base = {
    source: {
      connectionId: CONNECTION_ID,
      path: "/demo-source/members/{memberId}",
      method: "GET" as const,
      bindings: [
        {
          location: "path" as const,
          key: "memberId",
          valueFrom: "memberId" as const,
        },
      ],
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
  };
  return [
    {
      ...base,
      name: "Retirement file readiness · demonstration",
      module: "readiness",
      mappings: [
        mapping("dateOfBirth", "/person/dateOfBirth", "date"),
        mapping("ageYears", "/person/dateOfBirth", "number", "ageYears"),
        mapping("pensionJoiningDate", "/pension/joiningDate", "date"),
        mapping("employerJoiningDate", "/employer/joiningDate", "date"),
        mapping("serviceVerified", "/pension/serviceVerified", "boolean"),
        mapping("missingDocuments", "/documents/missingCount", "number"),
      ],
      graph: readinessGraph(),
      scenarios: [
        {
          id: "ready",
          name: "Ahmed complete record",
          memberId: "M001",
          assessmentDate: "2026-09-25",
          expectedStatus: "READY_FOR_REVIEW",
        },
        {
          id: "conflict",
          name: "Salim conflicting joining dates",
          memberId: "M002",
          assessmentDate: "2026-09-25",
          expectedStatus: "NEEDS_VERIFICATION",
        },
        {
          id: "missing",
          name: "Maryam missing confirmation",
          memberId: "M003",
          assessmentDate: "2026-09-25",
          expectedStatus: "NEEDS_VERIFICATION",
        },
        {
          id: "unavailable",
          name: "Khalid source unavailable",
          memberId: "M004",
          assessmentDate: "2026-09-25",
          expectedStatus: "UNABLE_TO_EVALUATE",
        },
      ],
    },
    {
      ...base,
      name: "Payment evidence comparison · baisa",
      module: "payment",
      mappings: [
        mapping("proposedBaisa", "/payment/proposedBaisa", "number"),
        mapping("approvedBaisa", "/payment/approvedBaisa", "number"),
        mapping(
          "adjustmentBaisa",
          "/payment/authorizedAdjustmentBaisa",
          "number",
        ),
        mapping("toleranceBaisa", "/payment/toleranceBaisa", "number"),
      ],
      graph: expressionGraph([
        {
          key: "differenceBaisa",
          value: "proposedBaisa - approvedBaisa - adjustmentBaisa",
        },
        {
          key: "status",
          value:
            'abs(proposedBaisa - approvedBaisa - adjustmentBaisa) > toleranceBaisa ? "FINDING" : "CLEAR"',
        },
        {
          key: "reason",
          value:
            'abs(proposedBaisa - approvedBaisa - adjustmentBaisa) > toleranceBaisa ? "Unexplained payment difference requires evidence review" : "Payment matches the supplied approval"',
        },
      ]),
      scenarios: [
        {
          id: "clear",
          name: "Approved amount matches",
          memberId: "M001",
          assessmentDate: "2026-09-25",
          expectedStatus: "CLEAR",
        },
        {
          id: "difference",
          name: "OMR 950 proposed, OMR 650 approved",
          memberId: "M005",
          assessmentDate: "2026-09-25",
          expectedStatus: "FINDING",
        },
        {
          id: "adjustment",
          name: "Authorized adjustment reconciles",
          memberId: "M006",
          assessmentDate: "2026-09-25",
          expectedStatus: "CLEAR",
        },
      ],
    },
    {
      ...base,
      name: "Contribution reconciliation · baisa",
      module: "contribution",
      mappings: [
        mapping("expectedBaisa", "/contribution/expectedBaisa", "number"),
        mapping("receivedBaisa", "/contribution/receivedBaisa", "number"),
      ],
      graph: expressionGraph([
        { key: "differenceBaisa", value: "expectedBaisa - receivedBaisa" },
        {
          key: "status",
          value: 'expectedBaisa == receivedBaisa ? "CLEAR" : "FINDING"',
        },
        {
          key: "reason",
          value:
            'expectedBaisa == receivedBaisa ? "Contributions reconcile" : "Contribution difference requires reconciliation"',
        },
      ]),
      scenarios: [
        {
          id: "clear",
          name: "Matching receipt",
          memberId: "M001",
          assessmentDate: "2026-09-25",
          expectedStatus: "CLEAR",
        },
        {
          id: "gap",
          name: "Unmatched contribution",
          memberId: "M007",
          assessmentDate: "2026-09-25",
          expectedStatus: "FINDING",
        },
        {
          id: "second-clear",
          name: "Second matching receipt",
          memberId: "M008",
          assessmentDate: "2026-09-25",
          expectedStatus: "CLEAR",
        },
      ],
    },
    {
      ...base,
      name: "Service evidence consistency",
      module: "service",
      mappings: [
        mapping("overlapMonths", "/service/overlapMonths", "number"),
        mapping("unverifiedMonths", "/service/unverifiedMonths", "number"),
      ],
      graph: expressionGraph([
        {
          key: "status",
          value:
            'overlapMonths > 0 or unverifiedMonths > 0 ? "FINDING" : "CLEAR"',
        },
        {
          key: "reason",
          value:
            'overlapMonths > 0 ? "Overlapping service periods require investigation" : (unverifiedMonths > 0 ? "Service months await verification" : "Configured service checks passed")',
        },
      ]),
      scenarios: [
        {
          id: "clear",
          name: "Verified continuous service",
          memberId: "M001",
          assessmentDate: "2026-09-25",
          expectedStatus: "CLEAR",
        },
        {
          id: "overlap",
          name: "Overlapping service",
          memberId: "M009",
          assessmentDate: "2026-09-25",
          expectedStatus: "FINDING",
        },
        {
          id: "unverified",
          name: "Unverified service",
          memberId: "M010",
          assessmentDate: "2026-09-25",
          expectedStatus: "FINDING",
        },
      ],
    },
  ];
}
export async function seed(
  pool: Pool,
  origin = "http://127.0.0.1:4000",
): Promise<void> {
  if (process.env.NODE_ENV === "production")
    throw new Error("Fictional seed is disabled in production");
  await transaction(pool, async (db) => {
    await seedDemoUsers(db);
    await db.query(
      "INSERT INTO connections(id,name,base_url,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [
        CONNECTION_ID,
        "Fictional pension REST source",
        origin,
        "demo-bootstrap",
      ],
    );
    const names = [
      ["Ahmed Al Nabhani", "أحمد النبهاني"],
      ["Salim Al Harthy", "سالم الحارثي"],
      ["Maryam Al Balushi", "مريم البلوشية"],
      ["Khalid Al Hinai", "خالد الهنائي"],
      ["Fatma Al Amri", "فاطمة العامرية"],
      ["Nasser Al Wahaibi", "ناصر الوهيبي"],
      ["Huda Al Kindi", "هدى الكندية"],
      ["Yousuf Al Rawahi", "يوسف الرواحي"],
      ["Aisha Al Maamari", "عائشة المعمرية"],
      ["Hamood Al Saadi", "حمود السعدي"],
      ["Noor Al Riyami", "نور الريامية"],
      ["Saeed Al Shukaili", "سعيد الشكيلي"],
    ];
    for (let i = 0; i < names.length; i++) {
      const id = `M${String(i + 1).padStart(3, "0")}`;
      const dob = `${1967 + i}-03-10`;
      const join = `${1991 + i}-06-01`;
      const retirement = `${2027 + i}-03-10`;
      const source = {
        fictional: true,
        memberId: id,
        person: { name: names[i]![0], nameAr: names[i]![1], dateOfBirth: dob },
        pension: { joiningDate: join, serviceVerified: i !== 9 },
        employer: { joiningDate: i === 1 ? `${1991 + i}-07-01` : join },
        documents: { missingCount: i === 2 ? 1 : 0 },
        payment: {
          proposedBaisa: i === 4 ? 950000 : i === 5 ? 700000 : 650000,
          approvedBaisa: 650000,
          authorizedAdjustmentBaisa: i === 5 ? 50000 : 0,
          toleranceBaisa: 0,
        },
        contribution: {
          expectedBaisa: 120000,
          receivedBaisa: i === 6 ? 90000 : 120000,
        },
        service: {
          overlapMonths: i === 8 ? 3 : 0,
          unverifiedMonths: i === 9 ? 6 : 0,
        },
      };
      await db.query(
        "INSERT INTO members(id,name,name_ar,organization,date_of_birth,date_of_joining,expected_retirement_date,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING",
        [
          id,
          names[i]![0],
          names[i]![1],
          "Fictional demonstration organization",
          dob,
          join,
          retirement,
          JSON.stringify(source),
        ],
      );
    }
    for (const rule of demoRules()) {
      if (
        (await db.query("SELECT 1 FROM rules WHERE name=$1", [rule.name]))
          .rowCount
      )
        continue;
      const id = randomUUID();
      await db.query(
        "INSERT INTO rules(id,family_id,name,module,version,graph,source,mappings,scenarios,connection_id,effective_from,effective_to,created_by,author_ids) VALUES($1,$1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,ARRAY[$11]::text[])",
        [
          id,
          rule.name,
          rule.module,
          JSON.stringify(rule.graph),
          JSON.stringify(rule.source),
          JSON.stringify(rule.mappings),
          JSON.stringify(rule.scenarios),
          CONNECTION_ID,
          rule.effectiveFrom,
          null,
          "designer",
        ],
      );
      await audit(db, "demo-bootstrap", "DEMO_DRAFT_SEEDED", "rule", id, {
        fictional: true,
        requiresTestingAndApproval: true,
      });
    }
    await seedDemoPolicies(db);
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  seed(pool, `http://127.0.0.1:${config.port}`)
    .then(() =>
      console.log(
        "12 fictional members, 4 draft decisions and 10 bilingual draft procedures are available. Test decisions, then independently approve and publish decisions and procedures through the UI.",
      ),
    )
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
