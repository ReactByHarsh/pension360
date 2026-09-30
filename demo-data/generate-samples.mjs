// Generates ten ORIGINAL fictional, text-only, one-page PDF fixtures.
// Uses Node.js built-ins only. No application dependency or external service.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtures = [
  {
    file: 'M002_appointment_letter.pdf', title: 'Appointment evidence',
    subtitle: 'A fictional employer letter for a joining-date conflict',
    memberId: 'M002', name: 'Salim Al Harthy', reference: 'DEMO-EMP-M002-001',
    rows: [
      ['Document type', 'Fictional appointment letter'],
      ['Employer', 'Fictional demonstration organization'],
      ['Employer joining date', '1992-07-01'],
      ['Pension source joining date', '1992-06-01'],
      ['Evidence status', 'Unverified until independently reviewed'],
    ],
    heading: 'Evidence to inspect',
    paragraphs: [
      'This fictional employer record states that Salim Al Harthy (M002) joined on 1992-07-01. The demonstration pension REST source separately reports 1992-06-01. These are different dates.',
      'The discrepancy requires evidence review. This letter alone does not establish which source is authoritative and must not automatically overwrite either source.',
      'Suggested extraction: memberId = M002; employerJoiningDate = 1992-07-01; pensionJoiningDate = 1992-06-01. Keep the source labels and quote the relevant line as evidence.',
    ],
    checkpoint: 'CHECKPOINT: two competing dates are preserved; no automatic correction.',
  },
  {
    file: 'M003_service_certificate_request.pdf', title: 'Missing evidence request',
    subtitle: 'A request for a service certificate - not the certificate itself',
    memberId: 'M003', name: 'Maryam Al Balushi', reference: 'DEMO-REQ-M003-001',
    rows: [
      ['Document type', 'Request for missing service certificate'],
      ['Mandatory item', 'Service certificate'],
      ['Document status', 'MISSING - certificate not supplied'],
      ['Missing mandatory items', '1'],
      ['Request date', '2026-09-25'],
    ],
    heading: 'Requested follow-up',
    paragraphs: [
      'The fictional case for Maryam Al Balushi (M003) is missing one mandatory service certificate. This file records the request for that evidence. It does not contain a service certificate.',
      'Please obtain the service certificate from the authorized source and arrange independent review. Do not infer completed or verified service from this request.',
      'Suggested extraction: memberId = M003; documentType = missing evidence request; missingDocument = service certificate; missingCount = 1. This request does not clear the readiness finding.',
    ],
    checkpoint: 'CHECKPOINT: uploading a request does not satisfy the missing certificate.',
  },
  {
    file: 'M005_payment_comparison.pdf', title: 'Payment evidence comparison',
    subtitle: 'An unexplained amount for human investigation',
    memberId: 'M005', name: 'Fatma Al Amri', reference: 'DEMO-PAY-M005-001',
    rows: [
      ['Proposed payment', 'OMR 950.000 / 950000 baisa'],
      ['Supplied approved amount', 'OMR 650.000 / 650000 baisa'],
      ['Authorized adjustment supplied', 'OMR 0.000 / 0 baisa'],
      ['Comparison tolerance', 'OMR 0.000 / 0 baisa'],
      ['Unexplained difference', 'OMR 300.000 / 300000 baisa'],
    ],
    heading: 'Review note',
    paragraphs: [
      'For fictional member Fatma Al Amri (M005), the supplied proposed payment is OMR 950.000 and the supplied approved amount is OMR 650.000. No authorized adjustment is supplied in the demonstration data.',
      'Difference: 950000 - 650000 - 0 = 300000 baisa, equivalent to OMR 300.000. Check the approval record and any authorized adjustments before concluding the investigation.',
      'This is an unexplained difference, not confirmed fraud, a confirmed overpayment, or realized savings. The application must not approve, block, recover or issue a pension payment from this finding.',
    ],
    checkpoint: 'CHECKPOINT: explain the difference, cite evidence, retain human review.',
  },
  {
    file: 'M006_payment_reconciliation.pdf', title: 'Payment reconciliation',
    subtitle: 'A zero unexplained difference with a supplied adjustment',
    memberId: 'M006', name: 'Nasser Al Wahaibi', reference: 'DEMO-PAY-M006-001',
    rows: [
      ['Proposed payment', 'OMR 700.000 / 700000 baisa'],
      ['Supplied approved amount', 'OMR 650.000 / 650000 baisa'],
      ['Supplied adjustment', 'OMR 50.000 / 50000 baisa'],
      ['Comparison tolerance', 'OMR 0.000 / 0 baisa'],
      ['Unexplained difference', 'OMR 0.000 / 0 baisa'],
    ],
    heading: 'Reconciliation evidence',
    paragraphs: [
      'For fictional member Nasser Al Wahaibi (M006), the demonstration source supplies OMR 700.000 proposed, OMR 650.000 approved and an OMR 50.000 adjustment. These labels describe fixture inputs, not an official authorization.',
      'Calculation: 700000 - 650000 - 50000 = 0 baisa. Compare this result with M005, whose supplied adjustment is zero and whose difference remains unexplained.',
      'A CLEAR comparison means the configured arithmetic reconciles. It does not authorize, release or issue a payment. Independently verify the actual approval and adjustment records in production.',
    ],
    checkpoint: 'CHECKPOINT: the adjustment reconciles the comparison; no payment is issued.',
  },
  {
    file: 'M007_contribution_reconciliation.pdf', title: 'Contribution reconciliation',
    subtitle: 'A contribution difference requiring source reconciliation',
    memberId: 'M007', name: 'Huda Al Kindi', reference: 'DEMO-CON-M007-001',
    rows: [
      ['Expected contribution', 'OMR 120.000 / 120000 baisa'],
      ['Received contribution', 'OMR 90.000 / 90000 baisa'],
      ['Difference', 'OMR 30.000 / 30000 baisa'],
      ['Period-level evidence', 'Not supplied by this sample'],
      ['Review status', 'Requires human reconciliation'],
    ],
    heading: 'Reconciliation request',
    paragraphs: [
      'For fictional member Huda Al Kindi (M007), the source reports 120000 baisa expected and 90000 baisa received. The arithmetic difference is 30000 baisa, equivalent to OMR 30.000.',
      'Obtain the relevant contribution period, receipt, remittance reference and posting evidence before deciding why the values differ. This sample does not invent a missing receipt or an employer debt.',
      'Suggested extraction: memberId = M007; expectedBaisa = 120000; receivedBaisa = 90000; differenceBaisa = 30000. Verify units against the original before accepting extracted values.',
    ],
    checkpoint: 'CHECKPOINT: OMR 30 remains a finding until the evidence is reconciled.',
  },
  {
    file: 'M009_service_overlap_review.pdf', title: 'Service overlap review',
    subtitle: 'A reported month count without invented service periods',
    memberId: 'M009', name: 'Aisha Al Maamari', reference: 'DEMO-SVC-M009-001',
    rows: [
      ['Overlapping service', '3 months'],
      ['Underlying date periods', 'Not supplied by the fixture'],
      ['Required evidence', 'Period-level service records'],
      ['Source action', 'No automatic deletion or correction'],
      ['Review status', 'Open evidence question'],
    ],
    heading: 'What the evidence establishes',
    paragraphs: [
      'For fictional member Aisha Al Maamari (M009), the demonstration REST source reports three overlapping service months. This sample repeats that count without constructing dates or employers that were not supplied.',
      'Obtain the underlying service periods and supporting records. Determine whether the overlap is a duplicate, an allowed arrangement or another condition under the approved business procedure.',
      'Suggested extraction: memberId = M009; overlappingMonths = 3. The rule finding supports review. It must not delete service or reduce an entitlement automatically.',
    ],
    checkpoint: 'CHECKPOINT: three months are flagged; the underlying periods remain unknown.',
  },
  {
    file: 'M010_unverified_service_request.pdf', title: 'Service verification request',
    subtitle: 'Evidence is pending; no invalid-service conclusion is implied',
    memberId: 'M010', name: 'Hamood Al Saadi', reference: 'DEMO-SVC-M010-001',
    rows: [
      ['Unverified service', '6 months'],
      ['Service verified flag', 'false'],
      ['Underlying date periods', 'Not supplied by the fixture'],
      ['Requested follow-up', 'Obtain service evidence for review'],
      ['Document type', 'Request - not proof of service'],
    ],
    heading: 'Pending verification',
    paragraphs: [
      'For fictional member Hamood Al Saadi (M010), six service months are unverified and the service-verified flag is false. These values describe missing verification, not proven invalid or fraudulent service.',
      'Obtain source service records and supporting evidence, then arrange independent review. This request is not a certificate and does not identify the underlying dates or organizations.',
      'Suggested extraction: memberId = M010; unverifiedMonths = 6; serviceVerified = false. Uploading or verifying this request does not change the upstream service flag or clear a previous finding.',
    ],
    checkpoint: 'CHECKPOINT: six months need verification; a request is not completion evidence.',
  },
  {
    file: 'DEMO_evidence_review_procedure.pdf', title: 'Evidence review procedure',
    subtitle: 'Fictional working guidance for a controlled product demonstration',
    memberId: 'GENERAL', name: 'No individual member', reference: 'DEMO-POL-001',
    rows: [
      ['Scope', 'Source conflict and evidence review'],
      ['Authority', 'Fictional demo guidance only'],
      ['Policy ingestion', 'Reviewed text in Policy intelligence'],
      ['PDF purpose', 'Presenter reference, not auto-ingestion'],
      ['Statutory formula', 'None supplied'],
    ],
    heading: 'Demonstration procedure',
    paragraphs: [
      'Preserve competing source values with their labels and timestamps. Request relevant evidence, inspect the original, and independently verify extracted fields. Record the review reason and retain rejected alternatives.',
      'A rule designer tests and submits a model. A separate reviewer approves before publication. An administrator or Super Admin cannot bypass the independent-review requirement by approving their own work.',
      'The ten seeded text procedures use the application policy lifecycle. This PDF is an illustrative reference only; downloading or uploading it does not publish policy or make it law. No automatic policy-PDF ingestion is implemented.',
    ],
    checkpoint: 'CHECKPOINT: guidance needs a controlled review; fictional content is not law.',
  },
  {
    file: 'DEMO_workforce_count_brief.pdf', title: 'Workforce count scenario',
    subtitle: 'Static rehearsal checkpoint alongside the live forecast',
    memberId: 'GENERAL', name: 'Fictional roster only', reference: 'DEMO-FRC-001',
    rows: [
      ['As-of date', '2026-09-25'],
      ['Horizon / date shift', '36 months / +12 months'],
      ['Roster count', '12 fictional members'],
      ['Baseline / scenario count', '3 / 2 members in the window'],
      ['Measure', 'Headcount only - no monetary liability'],
    ],
    heading: 'How to present the comparison',
    paragraphs: [
      'Run the live forecast with as-of date 2026-09-25, horizon 36 months and a positive 12-month shift. The untouched seeded roster produces baseline count 3 and scenario count 2, from a total roster of 12.',
      'The shift can move an expected retirement date outside the selected window. It does not remove a member from the roster, approve a policy change or establish statutory entitlement.',
      'This static page is a presenter aid. Use the live server-calculated result and visible settings as the current evidence. It is not an actuarial model, pension-cost estimate or liability forecast.',
    ],
    checkpoint: 'CHECKPOINT: show the live settings and counts; do not infer pension costs.',
  },
  {
    file: 'M002_case_handover.pdf', title: 'Evidence review handover',
    subtitle: 'A fictional review brief that does not advance case status',
    memberId: 'M002', name: 'Salim Al Harthy', reference: 'DEMO-CASE-M002-001',
    rows: [
      ['Issue', 'Conflicting joining dates'],
      ['Pension source date', '1992-06-01'],
      ['Employer source date', '1992-07-01'],
      ['Question for reviewer', 'Which evidence supports authority?'],
      ['Next action', 'Inspect and independently verify'],
    ],
    heading: 'Handover content',
    paragraphs: [
      'The fictional M002 readiness assessment identifies a joining-date discrepancy. The pension source reports 1992-06-01 and the employer source reports 1992-07-01. Both values must remain traceable.',
      'Inspect the appointment evidence and the real case linked to the saved assessment. Obtain any further authoritative evidence needed. Record a reviewer reason before advancing the actual workflow.',
      'This handover is a sample document, not a generated application case or completed review. It has no live case identifier, approval or signature. Uploading it does not resolve a case or update the official pension record.',
    ],
    checkpoint: 'CHECKPOINT: handover describes a next action; the reviewer controls the case.',
  },
];

const quote = value => String(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
function lines(value, maximum = 89) {
  const output = []; let current = '';
  for (const word of value.split(/\s+/)) {
    if ((current + ' ' + word).trim().length > maximum) { output.push(current); current = word; }
    else current = (current + ' ' + word).trim();
  }
  if (current) output.push(current);
  return output;
}
function pdf(fixture) {
  const stream = [];
  const text = (value, x, y, size = 11, font = 'F1', color = '0.12 0.20 0.28') =>
    stream.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${quote(value)}) Tj ET`);
  stream.push('0.07 0.16 0.26 rg 0 738 595 104 re f');
  text('PENSION360', 42, 801, 23, 'F2', '1 1 1');
  text('FICTIONAL DEMONSTRATION DATA', 42, 774, 10, 'F2', '0.66 0.86 1');
  text('DEMONSTRATION ONLY - NOT VALID EVIDENCE', 42, 713, 12, 'F2', '0.65 0.16 0.13');
  text(fixture.title, 42, 679, 23, 'F2');
  text(fixture.subtitle, 42, 657, 10, 'F1', '0.30 0.38 0.46');
  text(`MEMBER  ${fixture.memberId}  |  ${fixture.name}`, 42, 623, 12, 'F2');
  text(`REFERENCE  ${fixture.reference}  |  DEMO DATE  2026-09-25`, 42, 604, 9);
  stream.push('0.91 0.95 0.98 rg 42 429 511 154 re f');
  fixture.rows.forEach(([label, value], index) => {
    text(label, 54, 562 - index * 27, 10, 'F2');
    text(value, 236, 562 - index * 27, 10);
  });
  text(fixture.heading, 42, 402, 14, 'F2');
  let y = 380;
  for (const paragraph of fixture.paragraphs) {
    for (const line of lines(paragraph)) { text(line, 42, y, 10); y -= 15; }
    y -= 10;
  }
  if (y < 126) throw new Error(`Layout exceeds reserved footer: ${fixture.file}`);
  stream.push('0.81 0.87 0.92 RG 42 120 m 553 120 l S');
  for (const [index, line] of lines(fixture.checkpoint, 85).entries()) text(line, 42, 100 - index * 14, 9, 'F2');
  text('All names and facts are invented. No signature, seal or official authorization is provided.', 42, 59, 9);
  text('For controlled product demonstrations only. Human verification is required.  |  Page 1 of 1', 42, 43, 9);
  const content = stream.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
  ];
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, 'ascii')); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const crossReference = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}
for (const fixture of fixtures) {
  const bytes = pdf(fixture);
  await writeFile(join(directory, fixture.file), bytes);
  console.log(`${fixture.file}: ${bytes.length} bytes`);
}
