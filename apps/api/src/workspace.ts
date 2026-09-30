import type { Router } from "express";
import { z } from "zod";
import type { Deps, Role } from "./types.js";
import { userOf } from "./auth.js";
import { iso } from "./db.js";

type Metric = {
  id: string;
  label: string;
  page: string;
  description: string;
  sql: string;
};
type Queue = {
  id: string;
  title: string;
  page: string;
  description: string;
  sql: string;
};
const metric = (
  id: string,
  label: string,
  page: string,
  description: string,
  sql: string,
): Metric => ({ id, label, page, description, sql });
const queue = (
  id: string,
  title: string,
  page: string,
  description: string,
  sql: string,
): Queue => ({ id, title, page, description, sql });
const independentRule =
  "created_by<>$1 AND NOT ($1=ANY(author_ids)) AND submitted_by IS DISTINCT FROM $1";
const ownRule = "(created_by=$1 OR $1=ANY(author_ids) OR submitted_by=$1)";
const reviewCase =
  "status='IN_REVIEW' AND created_by<>$1 AND submitted_by IS DISTINCT FROM $1";
const reviewRule = `status IN ('IN_REVIEW','APPROVED') AND ${independentRule}`;
const reviewDocument =
  "status='EXTRACTED' AND created_by<>$1 AND transcribed_by IS DISTINCT FROM $1";
const reviewPolicy = "status='DRAFT' AND created_by<>$1";
const reviewAuthority = "status='DRAFT' AND created_by<>$1";
const latestSourceFailures = `SELECT e.* FROM (
  SELECT DISTINCT ON (e.member_id,r.module) e.* FROM evaluations e JOIN rules r ON r.id=e.rule_id
  WHERE NOT e.is_simulation ORDER BY e.member_id,r.module,e.created_at DESC,e.id DESC
) e WHERE e.status='UNABLE_TO_EVALUATE' AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(e.issues) issue WHERE issue->>'code' IN ('SOURCE_UNAVAILABLE','SOURCE_HTTP_ERROR')
)`;
const rulesSelect =
  "SELECT id,name AS title,status,NULL::text AS member_id,updated_at FROM rules";
const casesSelect = "SELECT id,title,status,member_id,updated_at FROM cases";
const documentsSelect =
  "SELECT id,title,status,member_id,updated_at FROM documents";
const policiesSelect =
  "SELECT id,title,status,NULL::text AS member_id,created_at AS updated_at FROM policies";
const authoritiesSelect =
  "SELECT id,field_name || ' · ' || source_name AS title,status,NULL::text AS member_id,created_at AS updated_at FROM source_authorities";
function definition(role: Role): { metrics: Metric[]; queues: Queue[] } {
  if (role === "OFFICER")
    return {
      metrics: [
        metric(
          "my-active-cases",
          "My assigned active cases",
          "cases",
          "Assigned to your identity and not resolved; submitted cases still await independent review.",
          "SELECT count(*) FROM cases WHERE assigned_to=$1 AND status<>'RESOLVED'",
        ),
        metric(
          "my-investigations",
          "My cases to investigate",
          "cases",
          "Assigned cases in Open or Investigating state.",
          "SELECT count(*) FROM cases WHERE assigned_to=$1 AND status IN ('OPEN','INVESTIGATING')",
        ),
        metric(
          "my-failed-documents",
          "My failed extractions",
          "documents",
          "Failed documents uploaded by your identity; inspect the error before retrying.",
          "SELECT count(*) FROM documents WHERE created_by=$1 AND status='FAILED'",
        ),
        metric(
          "team-active-cases",
          "Team active cases",
          "cases",
          "Shared workspace total, including cases assigned to other people.",
          "SELECT count(*) FROM cases WHERE status<>'RESOLVED'",
        ),
        metric(
          "source-failures",
          "Latest source failures",
          "members",
          "Latest live assessment per member and module with a REST availability or HTTP failure; this is saved evidence, not a service-health probe.",
          `SELECT count(*) FROM (${latestSourceFailures}) failures`,
        ),
      ],
      queues: [
        queue(
          "my-active-cases",
          "My assigned active cases",
          "cases",
          "Investigate Open cases; submitted recommendations require a different reviewer.",
          `${casesSelect} WHERE assigned_to=$1 AND status<>'RESOLVED'`,
        ),
        queue(
          "my-failed-documents",
          "My failed document processing",
          "documents",
          "Your uploads only. Retry processing after resolving the saved error.",
          `${documentsSelect} WHERE created_by=$1 AND status='FAILED'`,
        ),
        queue(
          "source-failures",
          "Latest REST source failures",
          "members",
          "Shared latest failure snapshots. A new live assessment is needed to establish recovery.",
          `SELECT id,'Source evidence unavailable · ' || member_id AS title,status,member_id,created_at AS updated_at FROM (${latestSourceFailures}) failures`,
        ),
      ],
    };
  if (role === "REVIEWER")
    return {
      metrics: [
        metric(
          "review-cases",
          "Independent case reviews",
          "cases",
          "Awaiting review, excluding cases you created or submitted.",
          `SELECT count(*) FROM cases WHERE ${reviewCase}`,
        ),
        metric(
          "review-documents",
          "Independent document checks",
          "documents",
          "Extracted documents uploaded by someone else; compare fields against the original before verification.",
          `SELECT count(*) FROM documents WHERE ${reviewDocument}`,
        ),
        metric(
          "review-rules",
          "Independent rule decisions",
          "studio",
          "Versions to review or publish, excluding every author and submitter. Current test and effective-date checks still apply.",
          `SELECT count(*) FROM rules WHERE ${reviewRule}`,
        ),
        metric(
          "review-policies",
          "Independent procedure reviews",
          "policy",
          "Draft procedures created by another identity.",
          `SELECT count(*) FROM policies WHERE ${reviewPolicy}`,
        ),
        metric(
          "review-authorities",
          "Independent source proposals",
          "governance",
          "Draft source-authority proposals created by someone else.",
          `SELECT count(*) FROM source_authorities WHERE ${reviewAuthority}`,
        ),
      ],
      queues: [
        queue(
          "review-cases",
          "Case recommendations awaiting your review",
          "cases",
          "Your own creations and submissions are excluded. Return incomplete evidence for investigation.",
          `${casesSelect} WHERE ${reviewCase}`,
        ),
        queue(
          "review-documents",
          "Extracted evidence to verify",
          "documents",
          "Your uploads are excluded. This queue does not imply that any extracted value is correct.",
          `${documentsSelect} WHERE ${reviewDocument}`,
        ),
        queue(
          "review-rules",
          "Rule review and publication",
          "studio",
          "Authors and submitters are excluded. Review submissions or publish approved versions after normal test/date validation.",
          `${rulesSelect} WHERE ${reviewRule}`,
        ),
        queue(
          "review-policies",
          "Draft procedures to review",
          "policy",
          "Read the proposed text before publication; your own drafts require another reviewer.",
          `${policiesSelect} WHERE ${reviewPolicy}`,
        ),
      ],
    };
  if (role === "DESIGNER")
    return {
      metrics: [
        metric(
          "my-drafts",
          "My rule drafts",
          "studio",
          "Versions you created, edited or submitted that are currently drafts.",
          `SELECT count(*) FROM rules WHERE status='DRAFT' AND ${ownRule}`,
        ),
        metric(
          "drafts-need-tests",
          "Drafts needing passing tests",
          "studio",
          "Your draft versions without a current passing test marker. Saving a change clears that marker.",
          `SELECT count(*) FROM rules WHERE status='DRAFT' AND ${ownRule} AND (NOT test_passed OR test_hash IS NULL)`,
        ),
        metric(
          "my-handovers",
          "My versions awaiting others",
          "studio",
          "Your submitted or approved versions require an independent reviewer or publisher.",
          `SELECT count(*) FROM rules WHERE status IN ('IN_REVIEW','APPROVED') AND ${ownRule}`,
        ),
        metric(
          "my-policy-drafts",
          "My procedure drafts",
          "policy",
          "Your unpublished procedure text, awaiting independent review.",
          "SELECT count(*) FROM policies WHERE status='DRAFT' AND created_by=$1",
        ),
        metric(
          "my-authority-drafts",
          "My source proposals",
          "governance",
          "Your source-authority proposals awaiting independent approval.",
          "SELECT count(*) FROM source_authorities WHERE status='DRAFT' AND created_by=$1",
        ),
      ],
      queues: [
        queue(
          "my-drafts",
          "My draft decision models",
          "studio",
          "Configure mappings, maintain scenarios and run tests before submission.",
          `${rulesSelect} WHERE status='DRAFT' AND ${ownRule}`,
        ),
        queue(
          "my-handovers",
          "Handovers awaiting an independent reviewer",
          "studio",
          "These versions are not your approval work; review progress without resubmitting them.",
          `${rulesSelect} WHERE status IN ('IN_REVIEW','APPROVED') AND ${ownRule}`,
        ),
        queue(
          "my-policy-drafts",
          "My draft procedures",
          "policy",
          "Draft evidence remains unavailable to Copilot until independently published.",
          `${policiesSelect} WHERE status='DRAFT' AND created_by=$1`,
        ),
        queue(
          "my-authority-drafts",
          "My proposed source authorities",
          "governance",
          "The proposal records governance intent; it does not overwrite source facts.",
          `${authoritiesSelect} WHERE status='DRAFT' AND created_by=$1`,
        ),
      ],
    };
  if (role === "AUDITOR")
    return {
      metrics: [
        metric(
          "audit-events",
          "Recorded audit events",
          "audit",
          "Full retained audit-log count; viewing this workspace does not change business records.",
          "SELECT count(*) FROM audit_events",
        ),
        metric(
          "live-evidence",
          "Saved live assessments",
          "members",
          "All persisted live attempts, including historical failures; simulations are excluded.",
          "SELECT count(*) FROM evaluations WHERE NOT is_simulation",
        ),
        metric(
          "verified-documents",
          "Verified documents",
          "documents",
          "Documents with an independent verification record.",
          "SELECT count(*) FROM documents WHERE status='VERIFIED'",
        ),
        metric(
          "published-rules",
          "Published decision versions",
          "studio",
          "Current published versions available for inspection.",
          "SELECT count(*) FROM rules WHERE status='PUBLISHED'",
        ),
        metric(
          "resolved-cases",
          "Resolved cases",
          "cases",
          "Internal findings marked resolved; this does not represent pension or payment approval.",
          "SELECT count(*) FROM cases WHERE status='RESOLVED'",
        ),
      ],
      queues: [
        queue(
          "recent-audit",
          "Recent audit activity",
          "audit",
          "Read-only evidence. Open the audit trail to inspect additional records.",
          "SELECT id::text,action || ' · ' || actor_id AS title,action AS status,NULL::text AS member_id,created_at AS updated_at FROM audit_events",
        ),
        queue(
          "published-rules",
          "Published rule evidence",
          "studio",
          "Inspect saved configuration and review history; simulations and changes are not permitted for this role.",
          `${rulesSelect} WHERE status='PUBLISHED'`,
        ),
        queue(
          "verified-documents",
          "Independently verified documents",
          "documents",
          "Compare stored fields with permitted original downloads and their audit record.",
          `${documentsSelect} WHERE status='VERIFIED'`,
        ),
      ],
    };
  // ADMIN and SUPER_ADMIN retain the same application capabilities; neither gains an approval bypass.
  return {
    metrics: [
      metric(
        "failed-jobs",
        "Failed background jobs",
        "jobs",
        "Terminal failures recorded by the worker; this does not measure current worker availability.",
        "SELECT count(*) FROM jobs WHERE status='FAILED'",
      ),
      metric(
        "disabled-connections",
        "Disabled REST connections",
        "studio",
        "Administratively disabled sources. Enabled connections are not proof of remote service health.",
        "SELECT count(*) FROM connections WHERE NOT enabled",
      ),
      metric(
        "team-active-cases",
        "Shared active cases",
        "cases",
        "All unresolved cases across the shared workspace.",
        "SELECT count(*) FROM cases WHERE status<>'RESOLVED'",
      ),
      metric(
        "team-review-backlog",
        "Shared review backlog",
        "cases",
        "Cases in review, submitted/approved rule versions, extracted documents, and draft procedures/source authorities. Your own work still needs another reviewer.",
        "SELECT (SELECT count(*) FROM cases WHERE status='IN_REVIEW') + (SELECT count(*) FROM rules WHERE status IN ('IN_REVIEW','APPROVED')) + (SELECT count(*) FROM documents WHERE status='EXTRACTED') + (SELECT count(*) FROM policies WHERE status='DRAFT') + (SELECT count(*) FROM source_authorities WHERE status='DRAFT') AS count",
      ),
      metric(
        "published-rules",
        "Published decision versions",
        "studio",
        "Current published rule configuration; it is not a claim of upstream connectivity.",
        "SELECT count(*) FROM rules WHERE status='PUBLISHED'",
      ),
      metric(
        "published-policies",
        "Published procedures",
        "policy",
        "Published text procedures, including any future-effective records; Copilot separately checks effective dates.",
        "SELECT count(*) FROM policies WHERE status='PUBLISHED'",
      ),
    ],
    queues: [
      queue(
        "failed-jobs",
        "Background jobs requiring attention",
        "jobs",
        "Inspect the failure and document state before an authorized retry.",
        "SELECT id,type || ' · ' || entity_id::text AS title,status,NULL::text AS member_id,updated_at FROM jobs WHERE status='FAILED'",
      ),
      queue(
        "disabled-connections",
        "Disabled source connections",
        "studio",
        "Configuration status only; this queue does not perform a connection-health check.",
        "SELECT id,name AS title,'DISABLED'::text AS status,NULL::text AS member_id,created_at AS updated_at FROM connections WHERE NOT enabled",
      ),
      queue(
        "team-rule-review",
        "Shared rule review backlog",
        "studio",
        "Team submissions and approved versions. Open the record to see independent-review eligibility and test evidence.",
        `${rulesSelect} WHERE status IN ('IN_REVIEW','APPROVED')`,
      ),
      queue(
        "team-case-review",
        "Shared case review backlog",
        "cases",
        "Includes your own submissions; another person must decide those recommendations.",
        `${casesSelect} WHERE status='IN_REVIEW'`,
      ),
    ],
  };
}

/** Read-only role focus over the existing shared organisational workspace, not a new row-entitlement model. */
export function registerWorkspaceRoutes(router: Router, { pool }: Deps) {
  router.get("/workspace", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const actor = userOf(req),
      asOf = new Date().toISOString();
    const plan = definition(actor.role);
    const values = (sql: string) => (sql.includes("$1") ? [actor.id] : []);
    const [metrics, queues] = await Promise.all([
      Promise.all(
        plan.metrics.map(async ({ sql, ...definition }) => {
          const result = await pool.query(sql, values(sql));
          return { ...definition, count: Number(result.rows[0]?.count ?? 0) };
        }),
      ),
      Promise.all(
        plan.queues.map(async ({ sql, ...definition }) => {
          const result = await pool.query(
            `SELECT entries.*,count(*) OVER() AS total FROM (${sql}) entries ORDER BY updated_at DESC,id DESC LIMIT 5`,
            values(sql),
          );
          return {
            ...definition,
            total: Number(result.rows[0]?.total ?? 0),
            items: result.rows.map((row) => ({
              id: String(row.id),
              title: row.title,
              status: row.status,
              ...(row.member_id ? { memberId: row.member_id } : {}),
              updatedAt: iso(row.updated_at),
            })),
          };
        }),
      ),
    ]);
    res.json({
      role: actor.role,
      userId: actor.id,
      asOf,
      scope: "shared-workspace",
      metrics,
      queues,
    });
  });
}
