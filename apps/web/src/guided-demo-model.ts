import type { Evaluation } from './types';

export type GuidedField = { key: string; label: string; type: 'text' | 'date' | 'number' | 'boolean'; required: boolean; section: string; help?: string };
export type GuidedRow = Record<string, string | number | boolean>;
export type GuidedTemplate = { id: string; title: string; description: string; modules: string[]; rows: GuidedRow[] };
export type GuidedRule = { id: string; name: string; module: string; version: number; effectiveFrom: string; effectiveTo?: string; compatible: boolean; reason?: string };
export type GuidedCatalog = { developmentOnly: boolean; explanation: string; assessmentDate: string; fields: GuidedField[]; templates: GuidedTemplate[]; publishedRules: GuidedRule[] };
export type GuidedPayload = { name: string; sourceSystem: string; importMethod: 'MANUAL' | 'CSV' | 'JSON' | 'SAMPLE'; fileName?: string; isSample: boolean; rows: GuidedRow[] };
export type GuidedPreview = { valid: boolean; previewHash?: string; rows: GuidedRow[]; errors: { row: number | null; field: string; message: string }[]; warnings: string[] };
export type GuidedBatchSummary = { id: string; name: string; sourceSystem: string; importMethod: string; fileName?: string; isSample: boolean; createdAt: string; createdBy: string; rowCount: number };
export type GuidedBatchRow = { rowNumber: number; memberId: string; externalReference?: string; facts: GuidedRow; sourceData: Record<string, unknown>; evaluations: Evaluation[]; documents: { id: string; title: string; status: string; provider?: string; scanStatus?: string }[]; cases: { id: string; title: string; category: string; status: string }[]; workflowRuns: { id: string; name: string; status: string }[] };
export type GuidedBatch = GuidedBatchSummary & { rows: GuidedBatchRow[] };
export type GuidedModule = { id: string; title: string; purpose: string; input: string; flow: string[]; route: string; next: string; copilot: string; related: string[]; ruleModule?: string };

export const guidedModules: GuidedModule[] = [
  { id: 'members', title: 'Member 360', purpose: 'See the member facts and where each fact came from.', input: 'Member name, organization, birth, joining and expected retirement dates.', flow: ['Supply member data', 'Inspect member profile', 'Ask about the recorded facts'], route: 'member', next: 'Open Member 360', copilot: 'members', related: ['Member'], },
  { id: 'readiness', title: 'Retirement readiness', purpose: 'Check whether the retirement file has sufficient, consistent evidence for review.', input: 'Pension and employer joining dates, service verification and missing-document count.', flow: ['Supply member data', 'Run readiness rule', 'Review finding and evidence'], route: 'readiness', next: 'Open readiness assessment', copilot: 'readiness', related: ['Readiness'], ruleModule: 'readiness' },
  { id: 'payment', title: 'Payment assurance', purpose: 'Compare the proposed payment against the approved amount and recorded adjustments.', input: 'Proposed, approved, adjustment and tolerance amounts, in whole baisa.', flow: ['Supply payment values', 'Run payment rule', 'Investigate the saved result'], route: 'payment-exceptions', next: 'Open payment assurance', copilot: 'payments', related: ['Payment'], ruleModule: 'payment' },
  { id: 'contribution', title: 'Contribution assurance', purpose: 'Find differences between expected and received contributions.', input: 'Expected and received contribution totals, in whole baisa.', flow: ['Supply contribution values', 'Run contribution rule', 'Review the discrepancy'], route: 'contributions', next: 'Open contribution assurance', copilot: 'contributions', related: ['Contribution'], ruleModule: 'contribution' },
  { id: 'service', title: 'Service assurance', purpose: 'Identify overlapping or unverified periods in the service record.', input: 'Overlapping and unverified service months.', flow: ['Supply service values', 'Run service rule', 'Review service evidence'], route: 'service', next: 'Open service assurance', copilot: 'contributions', related: ['Service'], ruleModule: 'service' },
  { id: 'documents', title: 'Documents & OCR', purpose: 'Extract fields from a source document and send them for independent verification.', input: 'A PDF, PNG or JPEG belonging to the selected saved member.', flow: ['Upload document', 'Inspect extracted fields', 'Verify as another person'], route: 'documents', next: 'Open document review', copilot: 'documents', related: ['Readiness', 'Member'] },
  { id: 'policy', title: 'Policy intelligence', purpose: 'Answer procedural questions using published policies and compare proposed changes.', input: 'Policy text is entered in the policy library and independently published. Member forms do not create policy text.', flow: ['Create a policy draft', 'Independent publication', 'Ask a source-backed question'], route: 'policies', next: 'Open policy library', copilot: 'policy', related: [] },
  { id: 'cases', title: 'Cases & investigation', purpose: 'Follow findings, add investigation notes and record independent decisions.', input: 'A saved rule finding or a case created from actual member evidence.', flow: ['Run an assessment', 'Investigate its case', 'Submit for independent review'], route: 'cases', next: 'Open case register', copilot: 'cases', related: ['Readiness', 'Payment', 'Contribution', 'Service'] },
  { id: 'workflows', title: 'BPMN workflows', purpose: 'Run a published process with real decision steps and human review tasks.', input: 'A saved member plus a published workflow with its decision steps bound to published rules.', flow: ['Start a workflow', 'Complete assigned tasks', 'Inspect saved events'], route: 'workflow-runs', next: 'Open workflow runs', copilot: 'workflows', related: ['Readiness', 'Payment'] },
  { id: 'dashboard', title: 'Dashboards', purpose: 'Read totals and exceptions calculated from the records in the workspace.', input: 'Saved members, assessments, cases and document processing results.', flow: ['Create and assess records', 'Refresh dashboard', 'Ask about the recorded totals'], route: 'executive', next: 'Open executive dashboard', copilot: 'dashboard', related: [] },
  { id: 'forecast', title: 'Retirement forecasting', purpose: 'Explore preparation demand using source-supplied retirement dates and scenario settings.', input: 'Expected retirement dates for several members; horizon and delay settings are chosen in the forecast screen.', flow: ['Supply member retirement dates', 'Choose forecast settings', 'Compare the calculated periods'], route: 'forecast', next: 'Open forecast', copilot: 'forecast', related: ['Member'] },
  { id: 'studio', title: 'Rules & data studio', purpose: 'Map source fields and edit decision logic in the existing JDM designer.', input: 'Actual source fields and a draft rule; tests and independent publication remain required.', flow: ['Inspect source facts', 'Edit and test a draft', 'Publish through another reviewer'], route: 'rule-use-cases', next: 'Open rule exercise lab', copilot: 'studio', related: ['Readiness', 'Payment', 'Contribution', 'Service'] },
  { id: 'governance', title: 'Source governance', purpose: 'Compare conflicting sources and record which source is authoritative.', input: 'Conflicting dates or verified document evidence plus a reviewed source-authority policy.', flow: ['Inspect conflicting evidence', 'Propose source resolution', 'Independent review'], route: 'source-governance', next: 'Open source governance', copilot: 'governance', related: ['Readiness'] },
  { id: 'integrations', title: 'ERP & pension integration', purpose: 'Show how the demonstration inputs will be replaced by controlled source-system imports.', input: 'This form supplies demonstration data. Live imports use configured connections, mapping and preview/commit controls.', flow: ['Inspect supplied facts', 'Configure source mapping', 'Preview and commit an import'], route: 'data-integrations', next: 'Open integrations', copilot: 'integrations', related: ['Member', 'Readiness', 'Payment', 'Contribution', 'Service'] },
  { id: 'reports', title: 'Work queues & reports', purpose: 'Review outstanding work and export evidence from saved investigations.', input: 'Cases, review decisions, document evidence and recorded audit events.', flow: ['Create investigation work', 'Inspect queues and reviews', 'Open evidence reports'], route: 'reports', next: 'Open report centre', copilot: 'cases', related: [] },
  { id: 'administration', title: 'Administration & audit', purpose: 'Inspect jobs, application access, AI configuration and recorded activity.', input: 'Operations performed in the actual workspace; AI settings and access are managed in their existing screens.', flow: ['Perform a permitted action', 'Inspect processing jobs', 'Review audit evidence'], route: 'audit', next: 'Open audit trail', copilot: 'governance', related: [] },
];

/** CSV uses the same field catalog as the form. Empty cells remain missing facts. */
export function parseGuidedCsv(text: string, fields: GuidedField[]): GuidedRow[] {
  if (text.length > 200_000) throw new Error('CSV is limited to 200 KB.');
  const input = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (char !== ',') {
        if (char === '\r' && input[i + 1] === '\n') i++;
        if (row.some(value => value.trim())) records.push(row);
        row = [];
      }
    } else if (char === '"') {
      if (cell || closed) throw new Error('CSV contains a quote outside a quoted field.');
      quoted = true;
    } else {
      if (closed && char.trim()) throw new Error('CSV has text after a closing quote.');
      if (!closed) cell += char;
    }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  row.push(cell);
  if (row.some(value => value.trim())) records.push(row);
  const headers = records.shift()?.map(value => value.trim()) ?? [];
  const fieldMap = new Map(fields.map(field => [field.key, field]));
  if (!headers.length || new Set(headers).size !== headers.length || headers.some(key => !fieldMap.has(key)))
    throw new Error('Use the provided CSV template with unique, recognized column names.');
  const missing = fields.filter(field => field.required && !headers.includes(field.key));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.map(field => field.key).join(', ')}.`);
  if (!records.length || records.length > 25) throw new Error('Import between 1 and 25 member rows.');
  return records.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has an incorrect number of columns.`);
    const result: GuidedRow = {};
    headers.forEach((key, column) => {
      const value = cells[column].trim();
      if (!value) return;
      const field = fieldMap.get(key)!;
      if (field.type === 'number') {
        if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`CSV row ${index + 2}: ${field.label} must be a whole number.`);
        result[key] = Number(value);
      } else if (field.type === 'boolean') {
        if (!['true', 'false'].includes(value.toLowerCase())) throw new Error(`CSV row ${index + 2}: ${field.label} must be true or false.`);
        result[key] = value.toLowerCase() === 'true';
      } else result[key] = value;
    });
    return result;
  });
}

export function guidedCsv(fields: GuidedField[], rows: GuidedRow[]): string {
  const escape = (value: unknown) => {
    let text = value === undefined || value === null ? '' : String(value);
    // Export member names safely when the file is opened in a spreadsheet.
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [fields.map(field => escape(field.key)).join(','), ...rows.map(row => fields.map(field => escape(row[field.key])).join(','))].join('\r\n');
}

export function guidedCounts(rows: GuidedBatchRow[]) {
  return {
    members: rows.length,
    assessments: rows.reduce((sum, row) => sum + row.evaluations.length, 0),
    documents: rows.reduce((sum, row) => sum + row.documents.length, 0),
    verified: rows.reduce((sum, row) => sum + row.documents.filter(doc => doc.status === 'VERIFIED').length, 0),
    cases: rows.reduce((sum, row) => sum + row.cases.length, 0),
    workflows: rows.reduce((sum, row) => sum + row.workflowRuns.length, 0),
  };
}
