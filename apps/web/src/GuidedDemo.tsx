import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Download, FileText, GitBranch, Play, Plus, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { api, getGuidedSampleDocument } from './api';
import { useCopilotForecast, useCopilotMember, useCopilotPage } from './Copilot';
import { copilotPageLabels, type CopilotPage } from './copilot-context';
import { hasRole } from './roles';
import { allowedScreen } from './restored/navigation';
import type { DocumentRecord, List, User } from './types';
import { date, displayValue } from './util';
import { Badge, ErrorBox, Field, KeyValues, ListMore, Loading, Notice, PageTitle, Panel, useAction, useResource } from './ui';
import { guidedCounts, guidedCsv, guidedModules, parseGuidedCsv, type GuidedBatch, type GuidedBatchSummary, type GuidedCatalog, type GuidedField, type GuidedPayload, type GuidedPreview, type GuidedRow } from './guided-demo-model';
import './guided-demo.css';

type Definition = { id: string; name: string; version: number; module: string; status: string };
const readFileBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('The selected file could not be read.'));
  reader.readAsDataURL(file);
});
function saveCsv(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', contents], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function jump(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }

export default function GuidedDemo({ user, navigate, initialModule = 'readiness' }: { user: User; navigate: (page: string) => void; initialModule?: string }) {
  const [moduleId, setModuleId] = useState(initialModule);
  const [refresh, setRefresh] = useState(0);
  const catalog = useResource<GuidedCatalog>('/guided-demo/catalog', refresh);
  const batches = useResource<List<GuidedBatchSummary>>('/guided-demo/batches', refresh);
  const [batchId, setBatchId] = useState('');
  const batch = useResource<GuidedBatch>(batchId ? `/guided-demo/batches/${encodeURIComponent(batchId)}` : null, refresh);
  const definitions = useResource<List<Definition>>('/workflows/definitions?limit=100', refresh);
  const [memberId, setMemberId] = useState('');
  const [form, setForm] = useState<GuidedPayload>({ name: 'Pension demonstration', sourceSystem: 'Pension / ERP demonstration input', importMethod: 'MANUAL', isSample: true, rows: [{}] });
  const [rowIndex, setRowIndex] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [preview, setPreview] = useState<GuidedPreview | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [requestId, setRequestId] = useState('');
  const [ruleIds, setRuleIds] = useState<string[]>([]);
  const [assessmentProgress, setAssessmentProgress] = useState<{ done: number; total: number } | null>(null);
  const [assessmentDate, setAssessmentDate] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [sampleKind, setSampleKind] = useState<'profile' | 'payment' | 'contribution' | 'service'>('profile');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [definitionId, setDefinitionId] = useState('');
  const [forecastDate, setForecastDate] = useState(new Date().toISOString().slice(0, 10));
  const [forecastHorizon, setForecastHorizon] = useState<12 | 36 | 60>(36);
  const [forecastDelay, setForecastDelay] = useState(12);
  const action = useAction();
  const module = guidedModules.find(item => item.id === moduleId) || guidedModules[0];
  const canImport = hasRole(user.role, 'ADMIN', 'OFFICER', 'DESIGNER');
  const canRun = hasRole(user.role, 'ADMIN', 'OFFICER', 'REVIEWER');
  const canUpload = canRun;
  const canAsk = user.role !== 'AUDITOR';
  const selectedRow = batch.data?.rows.find(row => row.memberId === memberId) || batch.data?.rows[0];
  const currentMemberId = selectedRow?.memberId || '';
  const payloadKey = JSON.stringify(form);
  const payloadRef = useRef(payloadKey); payloadRef.current = payloadKey;
  const count = guidedCounts(batch.data?.rows || []);
  const validPreview = preview?.valid && Boolean(preview.previewHash) && payloadKey === previewKey;
  useCopilotMember(currentMemberId);
  useCopilotPage(module.copilot as CopilotPage);
  useCopilotForecast({ asOfDate: forecastDate, horizonMonths: forecastHorizon, delayMonths: forecastDelay });
  useEffect(() => { if (catalog.data && !assessmentDate) setAssessmentDate(catalog.data.assessmentDate); }, [catalog.data, assessmentDate]);
  useEffect(() => { setAssessmentProgress(null); }, [batchId]);
  useEffect(() => { setSampleKind(['payment', 'contribution', 'service'].includes(moduleId) ? moduleId as 'payment' | 'contribution' | 'service' : 'profile'); }, [moduleId]);
  useEffect(() => { setDocumentFile(null); setDocumentTitle(''); setFileVersion(value => value + 1); }, [currentMemberId]);
  useEffect(() => { setPreview(null); setPreviewKey(''); setRequestId(''); }, [payloadKey]);
  const fields = catalog.data?.fields || [];
  const sections = [...new Set(fields.map(field => field.section))];
  const compatible = catalog.data?.publishedRules.filter(rule => rule.compatible) || [];
  const publishedDefinitions = definitions.data?.items.filter(definition => definition.status === 'PUBLISHED') || [];
  const availableRuleIds = ruleIds.filter(id => compatible.some(rule => rule.id === id));
  const refreshData = () => setRefresh(value => value + 1);
  const go = (route: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams({ ...(currentMemberId ? { m: currentMemberId } : {}), ...params });
    navigate(route + (query.size ? `?${query}` : ''));
  };
  const routeAllowed = (route: string) => allowedScreen(route, user.role, 'dev');
  function updateFact(field: GuidedField, value: string) {
    setForm(previous => ({ ...previous, importMethod: 'MANUAL', fileName: undefined, rows: previous.rows.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = { ...row };
      if (!value) delete next[field.key];
      else next[field.key] = field.type === 'boolean' ? value === 'true' : field.type === 'number' ? Number(value) : value;
      return next;
    }) }));
  }
  async function previewInput() {
    const snapshot = payloadKey;
    const result = await action.run(() => api<GuidedPreview>('/guided-demo/preview', form), 'Input checked. Review the server validation before creating a fresh batch.');
    if (result && payloadRef.current === snapshot) { setPreview(result); setPreviewKey(snapshot); setRequestId(crypto.randomUUID()); }
  }
  async function commit() {
    if (!validPreview || !preview?.previewHash || !requestId) return;
    const result = await action.run(() => api<{ batch: GuidedBatch; reused: boolean }>('/guided-demo/commit', { ...form, previewHash: preview.previewHash, requestId }), 'Batch saved. These records are now available to the rules, member screens and Copilot.');
    if (result) { setBatchId(result.batch.id); setMemberId(result.batch.rows[0]?.memberId || ''); refreshData(); setPreview(null); setRequestId(''); setTimeout(() => jump('guided-saved-batch'), 0); }
  }
  async function assessBatch() {
    const snapshot = batch.data;
    if (!snapshot) return;
    await action.run(async () => {
      setAssessmentProgress({ done: 0, total: snapshot.rows.length });
      try {
        let done = 0;
        for (const row of snapshot.rows) {
          await api(`/guided-demo/batches/${snapshot.id}/assess`, { ruleIds: availableRuleIds, assessmentDate, memberIds: [row.memberId] });
          setAssessmentProgress({ done: ++done, total: snapshot.rows.length });
        }
      } finally { refreshData(); }
    }, 'Batch assessments finished. The actual saved results and cases are shown below.');
  }
  if (catalog.loading && !catalog.data) return <Loading text="Loading the guided demonstration…"/>;
  return <div className="guided-demo">
    <PageTitle eyebrow="Real inputs · real saved results" title="Guided demo center" description="Choose a module, supply data and demonstrate its actual processing. Copilot questions use the evidence you have saved." actions={<button className="secondary" disabled={action.busy} onClick={refreshData}><RefreshCw size={16}/> Refresh evidence</button>}/>
    <ErrorBox error={catalog.error || batches.error || batch.error || definitions.error || action.error}/><Notice>{action.notice}</Notice>
    <div className="guided-origin"><FileText size={22}/><div><strong>Supply the data here for the demonstration.</strong><p>{catalog.data?.explanation || 'In the live system, these facts will come from the pension system or ERP through a configured integration.'} Saved inputs are labelled as unverified entered data. Document verification and source-authority review remain separate steps.</p></div><span className="pill">Development demo</span></div>
    <Panel title="1. What would you like to demonstrate?">
      <div className="guided-module-grid" role="group" aria-label="Demonstration modules">{guidedModules.map(item => <button key={item.id} aria-pressed={module.id === item.id} className={`guided-module ${module.id === item.id ? 'active' : ''}`} onClick={() => setModuleId(item.id)}><span>{item.title}</span>{module.id === item.id && <Check size={15}/>}</button>)}</div>
      <div className="guided-module-guide"><div><h3>{module.title}</h3><p>{module.purpose}</p><p className="muted"><strong>Data needed:</strong> {module.input}</p><ol>{module.flow.map(step => <li key={step}>{step}</li>)}</ol></div><button className="secondary" disabled={!routeAllowed(module.route)} onClick={() => go(module.route)}>{module.next}<ArrowRight size={16}/></button></div>
      {module.id === 'administration' && <p className="notice info">Administration uses the audit, jobs, access and AI settings screens. These administrative records are not supplied to Copilot; the shared panel below can answer source-governance questions only.</p>}
      {!routeAllowed(module.route) && <p className="hint">Your current role can read this guide. A permitted role opens this module and performs its actions.</p>}
      {module.id === 'forecast' && <div className="guided-form-grid"><Field label="Copilot forecast date"><input aria-label="Copilot forecast date" type="date" value={forecastDate} onChange={event => setForecastDate(event.target.value)}/></Field><Field label="Forecast horizon"><select aria-label="Forecast horizon" value={forecastHorizon} onChange={event => setForecastHorizon(Number(event.target.value) as 12 | 36 | 60)}><option value={12}>12 months</option><option value={36}>36 months</option><option value={60}>60 months</option></select></Field><Field label="Scenario delay in months"><input aria-label="Scenario delay in months" type="number" min={0} max={60} step={1} value={forecastDelay} onChange={event => setForecastDelay(Number(event.target.value))}/></Field><p className="hint">These visible settings are supplied to Copilot's forecast calculation. The full forecast screen has its own scenario controls.</p></div>}
    </Panel>
    {canImport ? <Panel title="2. Supply pension / ERP data">
      <div className="guided-input-choices"><div><h3>Load a fictional example</h3><Field label="Example scenario"><select aria-label="Example scenario" value={templateId} disabled={action.busy} onChange={event => setTemplateId(event.target.value)}><option value="">Choose an example</option>{catalog.data?.templates.map(template => <option key={template.id} value={template.id}>{template.title} · {template.rows.length} member{template.rows.length > 1 ? 's' : ''}</option>)}</select></Field><button className="secondary" disabled={action.busy || !templateId} onClick={() => {
        const template = catalog.data?.templates.find(item => item.id === templateId); if (!template) return;
        setForm({ name: template.title, sourceSystem: 'Fictional pension / ERP sample', importMethod: 'SAMPLE', isSample: true, rows: template.rows.map(row => ({ ...row })) }); setRowIndex(0); action.clear();
      }}><Plus size={15}/> Load sample into form</button><p className="hint">{catalog.data?.templates.find(template => template.id === templateId)?.description || 'You can inspect and change the fields before saving.'}</p></div>
      <div><h3>Upload a data file</h3><Field label="Pension / ERP CSV file" hint="CSV up to 200 KB; maximum 25 rows. Use the template so the column names match."><input aria-label="Pension / ERP CSV file" type="file" accept=".csv,text/csv" disabled={action.busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void action.run(async () => { if (file.size > 200_000) throw new Error('Choose a CSV file up to 200 KB.'); const rows = parseGuidedCsv(await file.text(), fields); setForm(previous => ({ ...previous, importMethod: 'CSV', fileName: file.name, isSample: false, rows })); setRowIndex(0); return rows; }, 'CSV loaded. Review and preview the values before saving.'); }}/></Field><button className="text-button" disabled={!fields.length} onClick={() => saveCsv(guidedCsv(fields, [{}]), 'Pension360_Intake_Template.csv')}><Download size={14}/> Download CSV template</button><button className="text-button" disabled={!fields.length} onClick={() => saveCsv(guidedCsv(fields, form.rows), 'Pension360_Current_Input.csv')}><Download size={14}/> Download current values</button></div></div>
      <form onSubmit={event => { event.preventDefault(); void previewInput(); }}>
        <fieldset disabled={action.busy} className="guided-form-fieldset"><div className="guided-form-grid"><Field label="Demonstration batch name"><input aria-label="Demonstration batch name" required minLength={3} maxLength={160} value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))}/></Field><Field label="Where this data comes from"><input aria-label="Where this data comes from" required minLength={2} maxLength={100} value={form.sourceSystem} onChange={event => setForm(previous => ({ ...previous, sourceSystem: event.target.value }))}/></Field><label className="guided-checkbox"><input type="checkbox" checked={form.isSample} onChange={event => setForm(previous => ({ ...previous, isSample: event.target.checked }))}/> Fictional demonstration data</label></div>
        <div className="guided-row-controls"><Field label="Member row to edit"><select aria-label="Member row to edit" value={rowIndex} onChange={event => setRowIndex(Number(event.target.value))}>{form.rows.map((row, index) => <option key={index} value={index}>{index + 1}. {String(row.name || 'New member')}</option>)}</select></Field><button type="button" className="secondary" disabled={form.rows.length >= 25} onClick={() => { setForm(previous => ({ ...previous, importMethod: 'MANUAL', rows: [...previous.rows, {}] })); setRowIndex(form.rows.length); }}><Plus size={14}/> Add member</button><button type="button" className="text-button" disabled={form.rows.length <= 1} onClick={() => { setForm(previous => ({ ...previous, importMethod: 'MANUAL', rows: previous.rows.filter((_, index) => index !== rowIndex) })); setRowIndex(0); }}>Remove this row</button><span className="muted">{form.rows.length} / 25 rows</span></div>
        {sections.map(section => {
          const sectionFields = fields.filter(field => field.section === section);
          const required = sectionFields.some(field => field.required);
          const relevant = required || module.related.some(name => section.toLowerCase().includes(name.toLowerCase()));
          return <details className="guided-fields-section" key={`${module.id}-${section}`} open={relevant || undefined}><summary>{section}{required ? ' · required profile fields' : ' · optional source facts'}</summary><div className="guided-form-grid">{sectionFields.map(field => <Field key={field.key} label={`${field.label}${field.required ? ' *' : ''}`} hint={field.help || (!field.required ? 'Leave blank if the source does not provide this fact.' : undefined)}>{field.type === 'boolean' ? <select aria-label={field.label} value={form.rows[rowIndex]?.[field.key] === undefined ? '' : String(form.rows[rowIndex][field.key])} onChange={event => updateFact(field, event.target.value)}><option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option></select> : <input aria-label={field.label} required={field.required} type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 1 : undefined} maxLength={field.type === 'text' ? 200 : undefined} value={String(form.rows[rowIndex]?.[field.key] ?? '')} onChange={event => updateFact(field, event.target.value)}/>}</Field>)}</div></details>;
        })}
        <p className="hint">Blank optional fields stay missing. A missing source fact can produce “Unable to evaluate”; no pension value is invented. Monetary values use whole baisa: 1 OMR = 1,000 baisa.</p>
        <button className="primary" disabled={action.busy || !catalog.data}><Check size={16}/> Preview & validate all rows</button></fieldset>
      </form>
      {preview && previewKey === payloadKey && <div className="guided-preview"><h3>{preview.valid ? 'Preview ready' : 'Correct the following inputs'}</h3>{preview.errors.map((error, index) => <p className="notice error" key={index}>{error.row !== null ? `Row ${error.row} · ` : ''}{error.field}: {error.message}</p>)}{preview.warnings.map(warning => <p className="notice warning" key={warning}>{warning}</p>)}<div className="guided-table-wrap"><table><thead><tr><th>Row</th><th>Member</th><th>Organization</th><th>Expected retirement</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}><td>{index + 1}</td><td>{displayValue(row.name)}</td><td>{displayValue(row.organization)}</td><td>{displayValue(row.expectedRetirementDate)}</td></tr>)}</tbody></table></div><p>Saving creates new member IDs in a separate demonstration batch. Existing member records are retained.</p><button className="primary" disabled={action.busy || !validPreview} onClick={() => void commit()}><Plus size={16}/> Create fresh demonstration batch</button></div>}
    </Panel> : <div className="notice info">Your role can inspect saved batches. An administrator, officer or designer supplies new demonstration data. Your normal assessment and review permissions still apply.</div>}
    <section id="guided-saved-batch"><Panel title="3. Continue with saved data" aside={<button className="text-button" disabled={action.busy} onClick={refreshData}><RefreshCw size={14}/> Refresh</button>}>
      <div className="guided-form-grid"><Field label="Saved demonstration batch"><select aria-label="Saved demonstration batch" value={batchId} disabled={action.busy} onChange={event => { setBatchId(event.target.value); setMemberId(''); }}><option value="">Choose a saved batch</option>{batches.data?.items.map(item => <option value={item.id} key={item.id}>{item.name} · {item.rowCount} member{item.rowCount === 1 ? '' : 's'} · {date(item.createdAt)}</option>)}</select></Field>{batch.data && <Field label="Member used for documents, workflow and Copilot"><select aria-label="Member used for documents, workflow and Copilot" value={currentMemberId} disabled={action.busy} onChange={event => setMemberId(event.target.value)}>{batch.data.rows.map(row => <option key={row.memberId} value={row.memberId}>{String(row.facts.name || row.memberId)} · {row.memberId}</option>)}</select></Field>}</div><ListMore query={batches} label="demonstration batches"/>
      {batch.loading && batchId ? <Loading/> : !batch.data ? <p className="muted">Create a batch above or select one already saved. Rule execution, document upload and workflow start become available once a member exists.</p> : <>
        <div className="guided-batch-stats">{[['Saved members', count.members], ['Assessments', count.assessments], ['Documents', count.documents], ['Verified documents', count.verified], ['Cases', count.cases], ['Workflow runs', count.workflows]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <div className="guided-origin compact"><div><strong>{batch.data.isSample ? 'Fictional demonstration batch' : 'Supplied demonstration batch'}</strong><p>{batch.data.sourceSystem} · {batch.data.importMethod} · saved {date(batch.data.createdAt)}{batch.data.fileName ? ` · ${batch.data.fileName}` : ''}</p><p>Imported records are visible in the shared demonstration workspace. Dashboard totals include other workspace records as well.</p></div></div>
        <div className="guided-journey" aria-label="Next demonstration actions"><button onClick={() => jump('guided-rules')}><Play size={16}/><span>Run rules<small>{count.assessments ? `${count.assessments} saved results` : 'No assessment yet'}</small></span><ChevronRight size={15}/></button><button onClick={() => jump('guided-documents')}><Upload size={16}/><span>Upload & review<small>{count.verified ? `${count.verified} verified documents` : `${count.documents} documents supplied`}</small></span><ChevronRight size={15}/></button><button disabled={!canAsk} onClick={() => jump('pension-copilot')}><Sparkles size={16}/><span>Ask Copilot<small>Use the actual saved evidence</small></span><ChevronRight size={15}/></button><button onClick={() => jump('guided-workflows')}><GitBranch size={16}/><span>Run workflow<small>{count.workflows ? `${count.workflows} saved runs` : 'Choose a published process'}</small></span><ChevronRight size={15}/></button><button disabled={!routeAllowed('executive')} onClick={() => go('executive')}><ArrowRight size={16}/><span>View dashboard<small>Workspace results and priorities</small></span></button></div>
        {selectedRow && <details className="guided-fields-section"><summary>Show saved source facts for {String(selectedRow.facts.name || selectedRow.memberId)}</summary><p><strong>Member ID:</strong> {selectedRow.memberId} {selectedRow.externalReference && `· External reference: ${selectedRow.externalReference}`}</p><KeyValues value={selectedRow.facts}/><details><summary>Inspect stored source response and provenance</summary><pre>{JSON.stringify(selectedRow.sourceData, null, 2)}</pre></details><button className="text-button" onClick={() => go('member')}>Open full member record <ArrowRight size={14}/></button></details>}
      </>}
    </Panel></section>
    {batch.data && <>
      <section id="guided-rules"><Panel title="Run the published rules on this batch">
        <p>Select up to four rules. The server reads each saved member's source data and records the actual decision and any resulting case.</p><Field label="Assessment date"><input aria-label="Assessment date" type="date" required value={assessmentDate} disabled={action.busy || !canRun} onChange={event => setAssessmentDate(event.target.value)}/></Field>
        <div className="guided-rule-options">{catalog.data?.publishedRules.map(rule => <label key={rule.id} className={`guided-rule-option ${!rule.compatible ? 'unavailable' : ''}`}><input type="checkbox" checked={availableRuleIds.includes(rule.id)} disabled={action.busy || !canRun || !rule.compatible || (!availableRuleIds.includes(rule.id) && availableRuleIds.length >= 4)} onChange={event => setRuleIds(previous => event.target.checked ? [...previous, rule.id] : previous.filter(id => id !== rule.id))}/><span><strong>{rule.name} · v{rule.version}</strong><small>{rule.module} · effective {rule.effectiveFrom}{rule.effectiveTo ? ` to ${rule.effectiveTo}` : ''}</small>{!rule.compatible && <small>{rule.reason || 'This source configuration does not read the saved demonstration members.'}</small>}</span></label>)}</div>
        {!compatible.length && <p className="notice info">No compatible published rule is available. Prepare and publish the standard pension source rules through the existing designer and independent review flow.</p>}
        <button className="primary" disabled={action.busy || !canRun || !availableRuleIds.length || !assessmentDate} onClick={() => void assessBatch()}><Play size={16}/> Run selected rules for {batch.data.rowCount} member{batch.data.rowCount === 1 ? '' : 's'}</button>
        {assessmentProgress && <p role="status" className="hint">{assessmentProgress.done} of {assessmentProgress.total} member assessment requests finished. Completed results remain saved if a later request fails; retrying the same rule version and date reuses those results.</p>}
        {!canRun && <p className="hint">An officer, reviewer or administrator runs published assessments. Designers can prepare inputs and edit rule drafts.</p>}
        <div className="guided-table-wrap"><table><thead><tr><th>Member</th><th>Rule / date</th><th>Saved result</th><th>Evidence</th></tr></thead><tbody>{batch.data.rows.flatMap(row => row.evaluations.map(evaluation => <tr key={evaluation.id}><td>{String(row.facts.name || row.memberId)}<small>{row.memberId}</small></td><td>{catalog.data?.publishedRules.find(rule => rule.id === evaluation.ruleId)?.name || evaluation.ruleId}<small>{evaluation.assessmentDate}</small></td><td><Badge value={evaluation.status}/></td><td><details><summary>Source, decision & issues</summary><KeyValues value={{ input: evaluation.input, output: evaluation.output, issues: evaluation.issues, provenance: evaluation.provenance }}/></details>{evaluation.caseId && <button className="text-button" disabled={!routeAllowed('case')} onClick={() => navigate(`case?m=${encodeURIComponent(row.memberId)}&c=${encodeURIComponent(evaluation.caseId!)}`)}>Open case <ArrowRight size={13}/></button>}</td></tr>))}{!count.assessments && <tr><td colSpan={4}>No saved assessment yet. Select a published rule and run it above.</td></tr>}</tbody></table></div>
      </Panel></section>
      <section id="guided-documents"><Panel title="Upload evidence for the selected member">
        <p><strong>{String(selectedRow?.facts.name || currentMemberId)}</strong> · {currentMemberId}. Upload a document belonging to this member. The extracted values are reviewed separately from the entered source facts.</p>
        {canUpload && <div className="guided-sample-document"><div className="guided-form-grid"><Field label="Matching sample document"><select aria-label="Matching sample document" value={sampleKind} disabled={action.busy} onChange={event => setSampleKind(event.target.value as typeof sampleKind)}><option value="profile">Member & joining-date record</option><option value="payment">Payment statement</option><option value="contribution">Contribution statement</option><option value="service">Service record</option></select></Field><div><button className="secondary" disabled={action.busy} onClick={() => void action.run(async () => { const file = await getGuidedSampleDocument(batch.data!.id, currentMemberId, sampleKind); setDocumentFile(file); setDocumentTitle(`Demonstration ${sampleKind} record · ${String(selectedRow?.facts.name || currentMemberId)}`.slice(0, 200)); setFileVersion(value => value + 1); return file; }, 'Matching PDF prepared. Inspect or download it, then use Upload & queue extraction to submit it.')}><FileText size={15}/> Prepare matching sample PDF</button></div></div><p className="hint">This English demonstration PDF is generated from the saved facts and contains this member's new ID. It demonstrates extraction; it is not independent source evidence.</p></div>}
        {canUpload && <form className="guided-form-grid" onSubmit={event => { event.preventDefault(); if (!documentFile) return; void action.run(async () => {
          if (documentFile.size > 5 * 1024 * 1024) throw new Error('Choose a document up to 5 MB.');
          const extension = documentFile.name.toLowerCase().split('.').pop();
          const mimeType = documentFile.type || ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' } as Record<string, string>)[extension || ''];
          if (!['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType)) throw new Error('Choose a PDF, PNG or JPEG document.');
          const result = await api<DocumentRecord>('/documents', { memberId: currentMemberId, title: documentTitle.trim(), mimeType, base64: await readFileBase64(documentFile) });
          setDocumentFile(null); setDocumentTitle(''); setFileVersion(value => value + 1); refreshData(); return result;
        }, 'Document saved and extraction queued. Refresh to see processing status, then open document review.'); }}>
          <Field label="Evidence document title"><input aria-label="Evidence document title" required maxLength={200} disabled={action.busy} value={documentTitle} onChange={event => setDocumentTitle(event.target.value)}/></Field><Field label="Member document file" hint="PDF, PNG or JPEG; maximum 5 MB."><input aria-label="Member document file" key={fileVersion} type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={action.busy} onChange={event => setDocumentFile(event.target.files?.[0] || null)}/></Field><div><button className="primary" disabled={action.busy || !documentFile || !documentTitle.trim()}><Upload size={16}/> Upload & queue extraction</button></div>
        </form>}
        {documentFile && <div className="guided-file-selection"><span><strong>Ready to upload:</strong> {documentFile.name}</span><button className="text-button" onClick={() => { const url = URL.createObjectURL(documentFile); const a = document.createElement('a'); a.href = url; a.download = documentFile.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={14}/> Download selected file</button></div>}
        <p className="hint">Automatic extraction needs a configured AI provider and a running document worker. The document review screen also supports labelled manual transcription. Only an independent reviewer verifies extracted evidence.</p>
        <div className="guided-evidence-list">{selectedRow?.documents.map(document => <div key={document.id}><span><strong>{document.title}</strong><small>{document.provider ? `Provider: ${document.provider}` : 'Provider not yet recorded'}{document.scanStatus ? ` · Scan: ${document.scanStatus}` : ''}</small></span><Badge value={document.status}/><button className="text-button" disabled={!routeAllowed('document')} onClick={() => go('document', { d: document.id })}>Review evidence <ArrowRight size={14}/></button></div>)}{!selectedRow?.documents.length && <p className="muted">No document has been uploaded for this member.</p>}</div>
      </Panel></section>
      <section id="guided-workflows"><Panel title="Continue through a published workflow">
        <p>Start a workflow for <strong>{String(selectedRow?.facts.name || currentMemberId)}</strong>. It executes its bound rules and saves human tasks. Completing a workflow does not post a payment to the ERP.</p>
        <div className="guided-form-grid"><Field label="Published workflow for this member"><select aria-label="Published workflow for this member" value={definitionId} disabled={action.busy || !canRun} onChange={event => setDefinitionId(event.target.value)}><option value="">Choose a published workflow</option>{publishedDefinitions.map(definition => <option value={definition.id} key={definition.id}>{definition.name} · v{definition.version}</option>)}</select></Field><div><button className="primary" disabled={action.busy || !canRun || !definitionId || !assessmentDate} onClick={() => void action.run(async () => { const result = await api('/workflows/instances', { definitionId, memberId: currentMemberId, assessmentDate, businessKey: `guided:${batch.data!.id}:${currentMemberId}:${definitionId}:${assessmentDate}` }); refreshData(); return result; }, 'Workflow request saved. Open its review tasks to continue the process.')}><GitBranch size={16}/> Start workflow</button></div></div>
        {!publishedDefinitions.length && <p className="notice info">Publish a workflow with valid rule bindings and an independent reviewer in the BPMN designer first.</p>}<ListMore query={definitions} label="workflow definitions"/>
        <div className="guided-evidence-list">{selectedRow?.workflowRuns.map(run => <div key={run.id}><span><strong>{run.name}</strong><small>{run.id}</small></span><Badge value={run.status}/></div>)}{!selectedRow?.workflowRuns.length && <p className="muted">No workflow run is saved for this member.</p>}</div><div className="actions"><button className="secondary" disabled={!routeAllowed('workflow-tasks')} onClick={() => go('workflow-tasks')}>Open human review tasks <ArrowRight size={14}/></button><button className="secondary" disabled={!routeAllowed('workflow-runs')} onClick={() => go('workflow-runs')}>Inspect workflow events <ArrowRight size={14}/></button></div>
      </Panel></section>
      <Panel title="Ask about what is actually in the system" aside={<Sparkles size={20}/>}><p>The Copilot below is scoped to <strong>{copilotPageLabels[module.copilot as CopilotPage]}</strong>{!['dashboard', 'forecast'].includes(module.copilot) && currentMemberId ? <> and <strong>{String(selectedRow?.facts.name || currentMemberId)}</strong></> : ' and workspace records'}. Suggested questions are generated from the available evidence. New inputs, assessments and document status changes refresh that evidence.</p><button className="primary" disabled={!canAsk} onClick={() => jump('pension-copilot')}><Sparkles size={16}/> See relevant questions & ask</button>{!canAsk && <p className="hint">Auditors can inspect existing evidence but cannot request AI answers.</p>}</Panel>
    </>}
  </div>;
}
