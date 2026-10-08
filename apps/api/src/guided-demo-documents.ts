import type { Router } from "express";
import { z } from "zod";
import { userOf } from "./db.js";
import { ApiError } from "./errors.js";
import { guidedRowSchema, type GuidedRow } from "./guided-demo-data.js";
import type { Deps } from "./types.js";

export const guidedDocumentKinds = ["profile", "payment", "contribution", "service"] as const;
export type GuidedDocumentKind = (typeof guidedDocumentKinds)[number];
export interface GuidedDocumentRecord {
  batchId: string;
  memberId: string;
  batchName: string;
  sourceSystem: string;
  importMethod: string;
  isSample: boolean;
  importedAt: string;
  facts: GuidedRow;
}
const titles: Record<GuidedDocumentKind, string> = {
  profile: "Member and readiness data extract",
  payment: "Payment input data extract",
  contribution: "Contribution input data extract",
  service: "Service input data extract",
};
const fieldGroups: Record<GuidedDocumentKind, [keyof GuidedRow, string][]> = {
  profile: [
    ["dateOfBirth", "Date of birth"],
    ["dateOfJoining", "Profile joining date"],
    ["expectedRetirementDate", "Supplied expected retirement date"],
    ["pensionJoiningDate", "Pension record joining date"],
    ["employerJoiningDate", "Employer record joining date"],
    ["serviceVerified", "Source service-verified flag"],
    ["missingDocuments", "Source missing-document count"],
  ],
  payment: [
    ["proposedBaisa", "Proposed payment (baisa)"],
    ["approvedBaisa", "Supplied approved entitlement (baisa)"],
    ["adjustmentBaisa", "Supplied authorized adjustment (baisa)"],
    ["toleranceBaisa", "Supplied comparison tolerance (baisa)"],
  ],
  contribution: [
    ["expectedBaisa", "Expected contribution (baisa)"],
    ["receivedBaisa", "Received contribution (baisa)"],
  ],
  service: [
    ["dateOfJoining", "Profile joining date"],
    ["pensionJoiningDate", "Pension record joining date"],
    ["employerJoiningDate", "Employer record joining date"],
    ["serviceVerified", "Source service-verified flag"],
    ["overlapMonths", "Overlapping service months"],
    ["unverifiedMonths", "Unverified service months"],
  ],
};
const notes: Record<GuidedDocumentKind, string[]> = {
  profile: [
    "Competing joining dates remain separate. This copy does not establish which source is authoritative.",
    "The expected retirement date is a supplied planning input. It is not an entitlement calculation or retirement approval.",
    "A source verification flag or checklist count is not an application review. Uploading this copy does not satisfy a missing independent certificate.",
  ],
  payment: [
    "Amounts are integer baisa: 1000 baisa = OMR 1.000. A missing adjustment is not a zero adjustment.",
    "Approval and adjustment labels repeat entered source facts; this copy provides no payment authorization. Run the published payment rule for a saved comparison.",
  ],
  contribution: [
    "Amounts are integer baisa: 1000 baisa = OMR 1.000. No contribution periods, remittance references or receipts are supplied by these aggregate inputs.",
    "Run the published contribution rule for a saved comparison. A difference alone does not establish an employer debt or its cause.",
  ],
  service: [
    "Month counts and a source verification flag are entered aggregate inputs. No underlying service periods or certificates are supplied by this extract.",
    "Keep competing dates separate. Run the published service rule and obtain independent evidence before any source correction or entitlement decision.",
  ],
};
interface Block { text: string; heading?: boolean; gap?: number }

/** English-only standard fonts avoid a server font/dependency requirement. Never silently corrupt Unicode. */
function englishText(value: string): string {
  if (/[^\x20-\x7e\t\r\n]/.test(value)) {
    throw new ApiError(400, "ENGLISH_DOCUMENT_TEXT_UNSUPPORTED", "This English sample PDF requires English/ASCII values in the exported fields. The system record remains unchanged. Upload an original PDF or image to review documents containing other characters.");
  }
  return value.replace(/[\t\r\n ]+/g, " ").trim();
}
function valueText(value: unknown): string {
  return value === undefined || value === null ? "Not supplied" : englishText(String(value));
}
function wrap(text: string, width = 85): string[] {
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > width) {
    const lastSpace = remaining.lastIndexOf(" ", width);
    const split = lastSpace > 0 ? lastSpace : width;
    lines.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  if (remaining || !lines.length) lines.push(remaining);
  return lines;
}
const quote = (text: string) => text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

/** Build from immutable intake facts, not invented certificates or canned member IDs. */
export function buildGuidedDocument(record: GuidedDocumentRecord, kind: GuidedDocumentKind): Buffer {
  const facts = guidedRowSchema.parse(record.facts);
  const safe = (value: string) => englishText(value);
  const blocks: Block[] = [
    {text:"Demonstration copy of entered/imported data - not independent source evidence", heading:true},
    {text:record.isSample ? "Fictional sample data, as declared at intake. No official signature or authorization is supplied." : "Entered/imported data. It has not been independently verified and is not labelled fictional by this extract."},
    {text:"Record and provenance", heading:true, gap:8},
    {text:`Demonstration member ID: ${safe(record.memberId)}`},
    {text:`Batch ID: ${safe(record.batchId)}`},
    {text:`Batch name: ${safe(record.batchName)}`},
    {text:`Intended future source system: ${safe(record.sourceSystem)}`},
    {text:"Source system is a declaration, not evidence this data was fetched from that system."},
    {text:`Input method: ${safe(record.importMethod)} | Imported at: ${safe(record.importedAt)}`},
    {text:`Pension / ERP reference: ${valueText(facts.externalReference)}`},
    {text:`Member name: ${safe(facts.name)}`},
    {text:`Organization: ${safe(facts.organization)}`},
  ];
  if (facts.nameAr) blocks.push({text:"Additional-language name: retained in the system record; not reproduced in this English copy."});
  blocks.push({text:"Entered values", heading:true, gap:8});
  for (const [key, label] of fieldGroups[kind]) blocks.push({text:`${label}: ${valueText(facts[key])}`});
  blocks.push({text:"How to use this copy", heading:true, gap:8});
  for (const text of notes[kind]) blocks.push({text, gap:3});
  blocks.push({text:"Download and upload this file to the same member in Document intelligence to demonstrate extraction and independent review. It remains a copy of the same input, not corroborating evidence. No rule result, case, source record or workflow is approved or changed by this download.", gap:5});

  // Fixed-width body makes line bounds deterministic, including unbroken source IDs.
  const pages: {text:string; y:number; heading:boolean}[][] = [[]];
  let y = 723;
  for (const block of blocks) {
    const lines = wrap(block.text, block.heading ? 82 : 85);
    const height = (block.gap ?? 0) + lines.length * 13 + 5;
    if (y - height < 87) { pages.push([]); y = 723; }
    y -= block.gap ?? 0;
    for (const line of lines) {
      pages[pages.length - 1]!.push({text:line, y, heading:!!block.heading});
      y -= 13;
    }
    y -= 5;
  }
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // Page tree filled once page object IDs are known.
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageIds: number[] = [];
  pages.forEach((lines, pageIndex) => {
    const stream: string[] = [];
    const text = (value: string, x: number, yy: number, size = 9.5, font = "F1", color = "0.13 0.20 0.28") =>
      stream.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${yy} Tm (${quote(value)}) Tj ET`);
    stream.push("0.07 0.12 0.30 rg 0 753 595 89 re f");
    text("PENSION 360 | DEMONSTRATION DATA EXTRACT", 42, 809, 11, "F3", "0.75 0.83 1");
    text(titles[kind], 42, 779, 19, "F3", "1 1 1");
    lines.forEach(line => text(line.text, 42, line.y, 9.5, line.heading ? "F2" : "F1"));
    stream.push("0.81 0.86 0.93 RG 42 70 m 553 70 l S");
    text("UNVERIFIED COPY | Not independent source evidence", 42, 53, 8, "F2");
    text(`English extract | Page ${pageIndex + 1} of ${pages.length}`, 42, 39, 8);
    const content = stream.join("\n");
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10,"0")} 00000 n \n`).join("")}`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

/** Register behind authentication. Explicit user check also protects accidental standalone registration. */
export function registerGuidedDocumentRoutes(router: Router, deps: Deps) {
  if (deps.config.env === "production") return;
  router.get("/guided-demo/batches/:id/members/:memberId/sample-document", async (req, res) => {
    userOf(req);
    const batchId = z.uuid().parse(req.params.id);
    const memberId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).parse(req.params.memberId);
    const kind = z.enum(guidedDocumentKinds).parse(req.query.kind ?? "profile");
    const {rows} = await deps.pool.query(
      `SELECT r.facts, b.name AS batch_name, b.source_system, b.import_method, b.is_sample, b.created_at
       FROM guided_demo_rows r JOIN guided_demo_batches b ON b.id = r.batch_id
       WHERE r.batch_id = $1 AND r.member_id = $2`, [batchId, memberId],
    );
    if (!rows.length) throw new ApiError(404, "NOT_FOUND", "The member was not found in this demonstration batch");
    const row = rows[0]!;
    const pdf = buildGuidedDocument({
      batchId, memberId, batchName:row.batch_name, sourceSystem:row.source_system,
      importMethod:row.import_method, isSample:row.is_sample,
      importedAt:new Date(row.created_at).toISOString(), facts:row.facts,
    }, kind);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Pension360_${memberId}_${kind}_data_extract.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(pdf);
  });
}
