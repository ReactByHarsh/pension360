import { describe, expect, it } from 'vitest';
import { guidedCounts, guidedCsv, guidedModules, parseGuidedCsv, type GuidedBatchRow, type GuidedField } from './guided-demo-model';

const fields: GuidedField[] = [
  { key: 'name', label: 'Member name', type: 'text', required: true, section: 'Member' },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true, section: 'Member' },
  { key: 'serviceVerified', label: 'Service verified', type: 'boolean', required: false, section: 'Readiness' },
  { key: 'adjustmentBaisa', label: 'Adjustment', type: 'number', required: false, section: 'Payment' },
];

describe('Guided demonstration data entry', () => {
  it('parses quotes, BOM, line breaks and typed source facts without inventing missing facts', () => {
    const rows = parseGuidedCsv('\uFEFFname,dateOfBirth,serviceVerified,adjustmentBaisa\r\n"Salim, \"\"Demo\"\"",1966-03-10,false,-1000\r\n"A name\nwith newline",1970-01-01,,\r\n', fields);
    expect(rows).toEqual([{ name: 'Salim, "Demo"', dateOfBirth: '1966-03-10', serviceVerified: false, adjustmentBaisa: -1000 }, { name: 'A name\nwith newline', dateOfBirth: '1970-01-01' }]);
    expect(rows[1]).not.toHaveProperty('serviceVerified');
  });
  it('rejects absent, duplicated or unknown source headers', () => {
    expect(() => parseGuidedCsv('name,name\nA,B', fields)).toThrow(/unique/);
    expect(() => parseGuidedCsv('name,dateOfBirth,__proto__\nA,1960-01-01,B', fields)).toThrow(/recognized/);
    expect(() => parseGuidedCsv('name\nA', fields)).toThrow(/required columns/);
  });
  it('does not coerce invalid boolean strings or decimal / unsafe whole-baisa amounts', () => {
    expect(() => parseGuidedCsv('name,dateOfBirth,serviceVerified\nA,1960-01-01,no', fields)).toThrow(/true or false/);
    expect(() => parseGuidedCsv('name,dateOfBirth,adjustmentBaisa\nA,1960-01-01,12.50', fields)).toThrow(/whole number/);
    expect(() => parseGuidedCsv('name,dateOfBirth,adjustmentBaisa\nA,1960-01-01,9007199254740992', fields)).toThrow(/whole number/);
  });
  it('rejects malformed CSV and respects import bounds', () => {
    expect(() => parseGuidedCsv('name,dateOfBirth\n"A,1960-01-01', fields)).toThrow(/unclosed/);
    expect(() => parseGuidedCsv('name,dateOfBirth\n"A"BAD,1960-01-01', fields)).toThrow(/closing quote/);
    expect(() => parseGuidedCsv('name,dateOfBirth\nA,1960-01-01,extra', fields)).toThrow(/columns/);
    expect(() => parseGuidedCsv('name,dateOfBirth\n' + 'A,1960-01-01\n'.repeat(26), fields)).toThrow(/25/);
    expect(() => parseGuidedCsv('name,dateOfBirth\n' + 'A'.repeat(200001), fields)).toThrow(/200 KB/);
  });
  it('exports round-trippable types and protects formula-like text in spreadsheets', () => {
    const rows = [{ name: 'A, "Quoted"', dateOfBirth: '1960-01-01', serviceVerified: false, adjustmentBaisa: -12 }];
    expect(parseGuidedCsv(guidedCsv(fields, rows), fields)).toEqual(rows);
    expect(guidedCsv(fields, [{ name: '=IMPORTDATA("example")', dateOfBirth: '1960-01-01' }])).toContain("'=IMPORTDATA");
  });
  it('counts actual persisted evidence without marking pending extraction as verified', () => {
    const row = { evaluations: [{ id: 'E1' }], documents: [{ id: 'D1', status: 'QUEUED' }, { id: 'D2', status: 'VERIFIED' }], cases: [{ id: 'C1' }], workflowRuns: [] } as unknown as GuidedBatchRow;
    expect(guidedCounts([row])).toEqual({ members: 1, assessments: 1, documents: 2, verified: 1, cases: 1, workflows: 0 });
    expect(guidedCounts([])).toEqual({ members: 0, assessments: 0, documents: 0, verified: 0, cases: 0, workflows: 0 });
  });
  it('covers all five business areas and the needed shared modules', () => {
    expect(guidedModules.map(module => module.id)).toEqual(expect.arrayContaining(['readiness', 'documents', 'policy', 'contribution', 'service', 'payment', 'members', 'forecast', 'dashboard', 'cases', 'workflows', 'studio', 'governance', 'integrations', 'reports', 'administration']));
    expect(new Set(guidedModules.map(module => module.id)).size).toBe(guidedModules.length);
  });
});
