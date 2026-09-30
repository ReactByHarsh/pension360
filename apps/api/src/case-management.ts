import { randomUUID } from "node:crypto";
import type { Router } from "express";
import { z } from "zod";
import type { Config } from "./config.js";
import type { Deps, User } from "./types.js";
import { hasRole, requireRole, userOf } from "./auth.js";
import { identityId, isActiveCaseAssignee } from "./access.js";
import { audit, expectRevision, iso, transaction, type Db } from "./db.js";
import { ApiError } from "./errors.js";
import { dateSchema, uuidSchema } from "./validation.js";
import { caseDto } from "./app.js";

export async function validateCaseAssignee(
  db: Db,
  config: Config,
  id: string,
): Promise<void> {
  if (
    !(await isActiveCaseAssignee(db, id, {
      allowDemoFallback: config.env !== "production",
    }))
  )
    throw new ApiError(
      400,
      "INVALID_ASSIGNEE",
      "Choose an active registered officer, reviewer or administrator",
    );
}
export async function notifyCaseAssignee(
  db: Db,
  row: Record<string, any>,
  actor: User,
  reason: string,
) {
  if (!row.assigned_to) return;
  await db.query(
    "INSERT INTO notifications(user_id,case_id,case_revision,kind,title,body,actor_id) VALUES($1,$2,$3,'CASE_MANAGEMENT_CHANGED',$4,$5,$6) ON CONFLICT(user_id,case_id,case_revision,kind) DO NOTHING",
    [
      row.assigned_to,
      row.id,
      row.revision,
      `Case attention: ${row.title}`,
      `Priority: ${row.priority ?? "NORMAL"}. Due date: ${row.due_date ? iso(row.due_date).slice(0, 10) : "not set"}. ${reason}`,
      actor.id,
    ],
  );
}
export function escapeReportText(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
const json = (value: unknown) =>
  `<pre>${escapeReportText(JSON.stringify(value, null, 2))}</pre>`;
const details = (values: Record<string, unknown>) =>
  `<dl>${Object.entries(values)
    .map(
      ([name, value]) =>
        `<dt>${escapeReportText(name)}</dt><dd>${escapeReportText(value ?? "Not recorded")}</dd>`,
    )
    .join("")}</dl>`;
function renderReport(data: {
  caseRecord: Record<string, any>;
  member: Record<string, any>;
  evaluations: Record<string, any>[];
  documents: Record<string, any>[];
  events: Record<string, any>[];
  counts: { evaluations: number; documents: number; events: number };
  generatedAt: string;
}) {
  const {
    caseRecord: record,
    member,
    evaluations,
    documents,
    events,
    counts,
    generatedAt,
  } = data;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Case evidence report · ${escapeReportText(record.id)}</title><style>body{font:15px/1.55 system-ui,sans-serif;color:#172d38;margin:0 auto;max-width:1050px;padding:38px}h1{font-size:30px}h2{border-bottom:2px solid #146c66;padding-bottom:7px;margin-top:32px}h3{margin-bottom:8px}a{color:#146c66}small,.muted{color:#526771}.notice{background:#eef7f5;border-left:4px solid #146c66;padding:14px}dl{display:grid;grid-template-columns:180px 1fr;gap:7px 16px}dt{font-weight:650}dd{margin:0;overflow-wrap:anywhere}pre{font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6f7;padding:12px}article{border:1px solid #dbe5e6;border-radius:8px;padding:18px;margin:16px 0;break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;border-bottom:1px solid #dbe5e6;padding:8px;vertical-align:top;overflow-wrap:anywhere}@media print{body{max-width:none;padding:0;font-size:11px}h1{font-size:22px}pre{font-size:9px}a{color:inherit}article{break-inside:auto}h2,h3{break-after:avoid}@page{size:A4;margin:16mm}}</style></head><body>
<p class="muted">Pension360 · Internal evidence report · Generated ${escapeReportText(generatedAt)}</p><h1>${escapeReportText(record.title)}</h1><p class="notice">This report records an internal case and saved evidence. It is not a pension entitlement decision, a payment authorization, or an instruction to change the pension/ERP system. Use your browser's Print command to save this report as PDF.</p>
<h2>Case and member</h2>${details({ "Case ID": record.id, "Member ID": record.member_id, "Member name": member.name, Category: record.category, Status: record.status, Priority: record.priority, "Due date (UTC day)": record.due_date ? iso(record.due_date).slice(0, 10) : null, Assignee: record.assigned_to, Creator: record.created_by, Submitter: record.submitted_by, Reviewer: record.reviewed_by, Revision: record.revision })}
<h2>Linked saved assessments</h2><p>${evaluations.length} of ${counts.evaluations} linked assessments included, newest first; report limit 200. Assessments preserve their original facts and rule version. <a href="#documents">Verified member documents</a> are listed separately.</p><ul>${evaluations.map((row) => `<li><a href="#evaluation-${escapeReportText(row.id)}">${escapeReportText(row.rule_name)} · v${escapeReportText(row.rule_version)} · ${escapeReportText(row.status)}</a></li>`).join("")}</ul>
${evaluations.map((row) => `<article id="evaluation-${escapeReportText(row.id)}"><h3>${escapeReportText(row.rule_name)} · version ${escapeReportText(row.rule_version)}</h3>${details({ "Assessment ID": row.id, "Rule ID": row.rule_id, "Assessment date": iso(row.assessment_date).slice(0, 10), Outcome: row.status, "Recorded at": iso(row.created_at) })}<h4>Mapped source facts</h4>${json(row.input)}<h4>Recorded output</h4>${json(row.output)}<h4>Provenance and issues</h4>${json({ provenance: row.provenance, issues: row.issues })}</article>`).join("") || "<p>No assessment evidence is linked to this case.</p>"}
<h2 id="documents">Verified member documents</h2><p>${documents.length} of ${counts.documents} verified documents for this member included, newest first; report limit 100. These are member-level supporting evidence and are not automatically attached to or determinative of this case. Originals are retained in the application and are not embedded in this report. Unverified extraction candidates are excluded.</p>
${documents.map((row) => `<article id="document-${escapeReportText(row.id)}"><h3>${escapeReportText(row.title)}</h3>${details({ "Document ID": row.id, Status: row.status, "Content SHA-256": row.content_hash, "Uploaded by": row.created_by, "Verified by": row.verified_by, "Verification reason": row.verification_reason })}${json(row.fields)}</article>`).join("") || "<p>No independently verified member documents are available.</p>"}
<h2>Case notes</h2>${json(record.notes)}<h2>Recorded audit activity</h2><p>${events.length} of ${counts.events} matching case, included-assessment and included-document events shown; newest first; report limit 500. This export is a snapshot and does not include subsequent changes.</p><table><thead><tr><th>Time</th><th>Actor</th><th>Action / object</th><th>Details</th></tr></thead><tbody>${events.map((row) => `<tr><td>${escapeReportText(iso(row.created_at))}</td><td>${escapeReportText(row.actor_id)}</td><td>${escapeReportText(row.action)}<br>${escapeReportText(row.entity_type)} / ${escapeReportText(row.entity_id)}</td><td>${json(row.details)}</td></tr>`).join("")}</tbody></table></body></html>`;
}

export function registerCaseManagementRoutes(router: Router, deps: Deps) {
  const { pool, config } = deps;
  router.patch(
    "/cases/:id/management",
    requireRole("ADMIN", "OFFICER"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        actor = userOf(req);
      const data = z
        .object({
          revision: z.number().int().positive(),
          reason: z.string().trim().min(10).max(2000),
          assignedTo: identityId.nullable().optional(),
          priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
          dueDate: dateSchema.nullable().optional(),
        })
        .strict()
        .refine(
          (value) =>
            value.assignedTo !== undefined ||
            value.priority !== undefined ||
            value.dueDate !== undefined,
          "Choose an assignment, priority or due-date change",
        )
        .parse(req.body);
      const row = await transaction(pool, async (db) => {
        const old = (
          await db.query("SELECT * FROM cases WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!old) throw new ApiError(404, "NOT_FOUND", "Case not found");
        expectRevision(old.revision, data.revision);
        const administrator = hasRole(actor.role, "ADMIN");
        if (
          !administrator &&
          (data.assignedTo !== undefined ||
            old.status === "RESOLVED" ||
            (old.assigned_to !== actor.id && old.created_by !== actor.id))
        )
          throw new ApiError(
            403,
            "CASE_MANAGEMENT_FORBIDDEN",
            "Officers may change priority or due date only on their own active cases; administrators manage assignments",
          );
        if (data.assignedTo)
          await validateCaseAssignee(db, config, data.assignedTo);
        const before = {
          assignedTo: old.assigned_to,
          priority: old.priority,
          dueDate: old.due_date ? iso(old.due_date).slice(0, 10) : null,
        };
        const after = {
          assignedTo:
            data.assignedTo === undefined ? before.assignedTo : data.assignedTo,
          priority: data.priority ?? before.priority,
          dueDate: data.dueDate === undefined ? before.dueDate : data.dueDate,
        };
        if (JSON.stringify(before) === JSON.stringify(after))
          throw new ApiError(
            409,
            "NO_CHANGE",
            "The selected case settings are already saved",
          );
        const updated = (
          await db.query(
            "UPDATE cases SET assigned_to=$2,priority=$3,due_date=$4,revision=revision+1,updated_at=now(),notes=notes || $5::jsonb WHERE id=$1 RETURNING *",
            [
              id,
              after.assignedTo,
              after.priority,
              after.dueDate,
              JSON.stringify([
                {
                  id: randomUUID(),
                  text: data.reason,
                  actor: actor.id,
                  createdAt: new Date().toISOString(),
                  management: { before, after },
                },
              ]),
            ],
          )
        ).rows[0];
        await audit(
          db,
          actor,
          "CASE_MANAGEMENT_UPDATED",
          "case",
          id,
          { before, after, reason: data.reason, revision: updated.revision },
          req.requestId,
        );
        await notifyCaseAssignee(db, updated, actor, data.reason);
        return updated;
      });
      res.json(caseDto(row));
    },
  );

  router.get("/notifications", async (req, res) => {
    const actor = userOf(req),
      { limit, offset, unreadOnly } = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
          unreadOnly: z.enum(["true", "false"]).default("false"),
        })
        .strict()
        .parse(req.query);
    const [messages, counts, overdue] = await Promise.all([
      pool.query(
        "SELECT * FROM notifications WHERE user_id=$1 AND ($2::boolean=false OR read_at IS NULL) ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4",
        [actor.id, unreadOnly === "true", limit, offset],
      ),
      pool.query(
        "SELECT count(*) FILTER(WHERE $2::boolean=false OR read_at IS NULL) AS total,count(*) FILTER(WHERE read_at IS NULL) AS unread FROM notifications WHERE user_id=$1",
        [actor.id, unreadOnly === "true"],
      ),
      pool.query(
        "SELECT id,title,member_id,priority,due_date,status,count(*) OVER() AS total FROM cases WHERE assigned_to=$1 AND status<>'RESOLVED' AND due_date<(now() AT TIME ZONE 'UTC')::date ORDER BY due_date,id LIMIT 5",
        [actor.id],
      ),
    ]);
    const total = Number(counts.rows[0].total);
    res.json({
      userId: actor.id,
      items: messages.rows.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        actorId: row.actor_id,
        readAt: row.read_at ? iso(row.read_at) : null,
        createdAt: iso(row.created_at),
      })),
      total,
      limit,
      offset,
      hasMore: offset + messages.rows.length < total,
      unreadCount: Number(counts.rows[0].unread),
      overdue: {
        total: Number(overdue.rows[0]?.total ?? 0),
        items: overdue.rows.map((row) => ({
          id: row.id,
          title: row.title,
          memberId: row.member_id,
          priority: row.priority,
          status: row.status,
          dueDate: iso(row.due_date).slice(0, 10),
        })),
      },
    });
  });
  router.patch("/notifications/:id/read", async (req, res) => {
    const id = uuidSchema.parse(req.params.id),
      actor = userOf(req);
    z.object({}).strict().parse(req.body);
    const row = (
      await pool.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at",
        [id, actor.id],
      )
    ).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Notification not found");
    res.json({ id: row.id, readAt: iso(row.read_at) });
  });
  router.get(
    "/cases/:id/report",
    requireRole("ADMIN", "OFFICER", "REVIEWER", "AUDITOR"),
    async (req, res) => {
      const id = uuidSchema.parse(req.params.id),
        actor = userOf(req),
        query = z
          .object({ format: z.literal("json").optional() })
          .strict()
          .parse(req.query);
      const record = (await pool.query("SELECT * FROM cases WHERE id=$1", [id]))
        .rows[0];
      if (!record) throw new ApiError(404, "NOT_FOUND", "Case not found");
      const [member, evaluations, documents] = await Promise.all([
        pool.query("SELECT id,name FROM members WHERE id=$1", [
          record.member_id,
        ]),
        pool.query(
          "SELECT e.*,r.name AS rule_name,r.version AS rule_version,count(*) OVER() AS total FROM evaluations e JOIN rules r ON r.id=e.rule_id WHERE NOT e.is_simulation AND e.member_id=$2 AND (e.id=$3 OR EXISTS(SELECT 1 FROM case_evaluations ce WHERE ce.case_id=$1 AND ce.evaluation_id=e.id)) ORDER BY e.created_at DESC,e.id DESC LIMIT 200",
          [id, record.member_id, record.evaluation_id],
        ),
        pool.query(
          "SELECT id,title,status,fields,content_hash,created_by,verified_by,verification_reason,count(*) OVER() AS total FROM documents WHERE member_id=$1 AND status='VERIFIED' ORDER BY updated_at DESC,id DESC LIMIT 100",
          [record.member_id],
        ),
      ]);
      const objectIds = [
        id,
        ...evaluations.rows.map((row) => row.id),
        ...documents.rows.map((row) => row.id),
      ];
      const events = await pool.query(
        "SELECT *,count(*) OVER() AS total FROM audit_events WHERE entity_id=ANY($1::text[]) AND entity_type IN ('case','evaluation','document') ORDER BY created_at DESC,id DESC LIMIT 500",
        [objectIds],
      );
      const generatedAt = new Date().toISOString(),
        filename = `case-${id}-evidence.html`;
      const html = renderReport({
        caseRecord: record,
        member: member.rows[0],
        evaluations: evaluations.rows,
        documents: documents.rows,
        events: events.rows,
        generatedAt,
        counts: {
          evaluations: Number(evaluations.rows[0]?.total ?? 0),
          documents: Number(documents.rows[0]?.total ?? 0),
          events: Number(events.rows[0]?.total ?? 0),
        },
      });
      await audit(
        pool,
        actor,
        "CASE_REPORT_EXPORTED",
        "case",
        id,
        {
          generatedAt,
          evaluationsIncluded: evaluations.rows.length,
          verifiedMemberDocumentsIncluded: documents.rows.length,
          format: "printable-html",
        },
        req.requestId,
      );
      if (query.format === "json") {
        res.json({ filename, html });
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(html);
    },
  );
}
