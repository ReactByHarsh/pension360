/**
 * Guided import + database-grounded Copilot acceptance.
 * npm run build, then TEST_DATABASE_URL=... node scripts/guided-demo-acceptance.mjs
 * Creates/drops a random schema. Does not load .env or contact an AI provider.
 * The exported suite also permits an explicitly labelled scratch-only SQL adapter.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../apps/api/dist/migrate.js';
import { seed } from '../apps/api/dist/seed.js';
import { createApp } from '../apps/api/dist/app.js';
import { loadConfig } from '../apps/api/dist/config.js';
import { registerDomainRoutes } from '../apps/api/dist/domain.js';

export async function runGuidedDemoAcceptance(pool, { runtime = 'Native PostgreSQL', concurrent = true } = {}) {
  const checks = [], captured = [], tokens = {};
  const provider = {
    name: 'explicit-acceptance-provider-double',
    async complete(request) {
      captured.push(structuredClone(request));
      return { answer: 'Controlled acceptance response; no live AI generation claimed.', citationIds: request.allowedCitationIds, fields: [] };
    },
  };
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://isolated-acceptance-schema' });
  await migrate(pool);
  const app = createApp(config, pool, (router, deps) => registerDomainRoutes(router, deps, provider));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  config.sourceAllowedOrigins = [origin];
  config.sourceAllowPrivateOrigins = [origin];
  config.sourceAllowHttpOrigins = [origin];
  const send = async (method, endpoint, body, role = 'officer', expected = 200) => {
    const response = await fetch(`${origin}/api/v1${endpoint}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json();
    assert.equal(response.status, expected, `${method} ${endpoint}: ${JSON.stringify(value)}`);
    return value;
  };
  const get = (endpoint, role = 'officer', expected = 200) => send('GET', endpoint, undefined, role, expected);
  const post = (endpoint, body, role = 'officer', expected = 200) => send('POST', endpoint, body, role, expected);
  const check = async (name, fn) => { await fn(); checks.push(name); };
  const snapshot = async () => JSON.stringify((await pool.query("SELECT * FROM members WHERE id !~ '^DEMO_' ORDER BY id")).rows);
  try {
    await seed(pool, origin);
    for (const role of ['admin', 'designer', 'officer', 'reviewer', 'auditor']) tokens[role] = (await post('/auth/dev', { userId: role }, null)).accessToken;
    const originalMembers = await snapshot();
    const baseline = (await get('/dashboard')).counts;
    await check('Catalog requires authentication and provides read-only access for an auditor', async () => {
      await get('/guided-demo/catalog', null, 401);
      const catalog = await get('/guided-demo/catalog', 'auditor');
      assert.ok(catalog.fields.length >= 5);
      assert.ok(catalog.templates.length >= 1);
    });
    const ruleList = (await get('/rules', 'designer')).items;
    const published = [];
    for (let rule of ruleList) {
      const tested = await post(`/rules/${rule.id}/test`, {}, 'designer');
      assert.equal(tested.passed, true);
      rule = await post(`/rules/${rule.id}/submit`, { revision: rule.revision }, 'designer');
      rule = await post(`/rules/${rule.id}/review`, { revision: rule.revision, decision: 'approve', reason: 'Independent acceptance of supplied fictional test scenarios' }, 'reviewer');
      rule = await post(`/rules/${rule.id}/publish`, { revision: rule.revision }, 'reviewer');
      published.push(rule);
    }
    checks.push('Existing four native ZEN models pass scenarios and independent publication');
    const row = {
      name: 'Acceptance Imported Member', organization: 'Acceptance Pension Source', externalReference: 'EXTERNAL-ACCEPTANCE-42',
      dateOfBirth: '1964-04-21', dateOfJoining: '1991-03-14', expectedRetirementDate: '2027-04-21',
      pensionJoiningDate: '1991-03-14', employerJoiningDate: '1991-03-14', serviceVerified: true, missingDocuments: 0,
      proposedBaisa: 1425000, approvedBaisa: 1300000, adjustmentBaisa: 0, toleranceBaisa: 500,
      expectedBaisa: 280000, receivedBaisa: 200000, overlapMonths: 2, unverifiedMonths: 1,
    };
    const input = { name: 'Acceptance manual source batch', sourceSystem: 'Fictional ERP supplied by presenter', importMethod: 'MANUAL', isSample: false, rows: [row] };
    let preview, batch;
    await check('Invalid dates cannot create records and preview is non-mutating', async () => {
      const invalid = await post('/guided-demo/preview', { ...input, rows: [{ ...row, dateOfBirth: '1964-02-31' }] });
      assert.equal(invalid.valid, false);
      preview = await post('/guided-demo/preview', input);
      assert.equal(preview.valid, true);
      assert.equal((await get('/dashboard')).counts.members, baseline.members);
      assert.equal(await snapshot(), originalMembers);
    });
    const commit = { ...input, previewHash: preview.previewHash, requestId: randomUUID() };
    await check('Reviewer and auditor cannot commit source data', async () => {
      await post('/guided-demo/commit', commit, 'reviewer', 403);
      await post('/guided-demo/commit', commit, 'auditor', 403);
    });
    await check('Stale preview cannot commit edited values', async () => {
      await post('/guided-demo/commit', { ...commit, rows: [{ ...row, name: 'Changed after preview' }] }, 'officer', 409);
    });
    await check('Commit creates a separate batch and repeated request does not duplicate it', async () => {
      const saved = await post('/guided-demo/commit', commit, 'officer', 201);
      batch = saved.batch;
      const repeated = await post('/guided-demo/commit', commit);
      assert.equal(repeated.reused, true);
      assert.equal(repeated.batch.id, batch.id);
      assert.equal((await get('/dashboard')).counts.members, baseline.members + 1);
      assert.equal(await snapshot(), originalMembers);
    });
    const imported = (await pool.query("SELECT id,source_data FROM members WHERE source_data->'ingestion'->>'batchId'=$1", [batch.id])).rows;
    assert.equal(imported.length, 1, 'Exactly one imported member must be linked to its batch');
    const memberId = imported[0].id;
    assert.match(memberId, /^DEMO_/);
    await check('Uploaded source provenance is retained and records appear in normal member APIs', async () => {
      const member = await get(`/members/${memberId}`);
      assert.equal(member.name, row.name);
      assert.equal(member.dateOfBirth, row.dateOfBirth);
      assert.equal(imported[0].source_data.ingestion.batchId, batch.id);
      assert.match(JSON.stringify(imported[0].source_data.ingestion), /unverified|declar|import|manual/i);
    });
    await check('Four English document downloads use the actual batch member and retain unverified-copy provenance', async () => {
      for (const kind of ['profile', 'payment', 'contribution', 'service']) {
        const response = await fetch(`${origin}/api/v1/guided-demo/batches/${batch.id}/members/${memberId}/sample-document?kind=${kind}`, { headers: { Authorization: `Bearer ${tokens.officer}` }, signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /application\/pdf/);
        const content = Buffer.from(await response.arrayBuffer()).toString('ascii');
        assert.ok(content.startsWith('%PDF-'));
        assert.ok(content.includes(memberId));
        assert.ok(content.includes(row.name));
        assert.ok(content.includes('UNVERIFIED COPY'));
        assert.ok(content.includes('not independent source evidence'));
        if (kind === 'payment') assert.ok(content.includes('1425000'));
        if (kind === 'contribution') assert.ok(content.includes('280000'));
      }
      await get(`/guided-demo/batches/${batch.id}/members/M001/sample-document?kind=profile`, 'officer', 404);
    });
    await check('Questions use the selected imported amounts and disable unavailable rule/document evidence', async () => {
      const suggestion = await post('/assistant/suggestions', { page: 'payments', memberId });
      assert.equal(suggestion.page, 'payments');
      assert.equal(suggestion.memberId, memberId);
      assert.equal(suggestion.generatedAnswer, false);
      const amounts = suggestion.questions.find(value => value.id === 'payment-inputs');
      assert.equal(amounts.available, true);
      assert.ok(amounts.question.includes(memberId));
      assert.ok(amounts.question.includes('1425000'));
      assert.ok(amounts.question.includes('1300000'));
      assert.ok(amounts.evidenceRefs.some(value => value.id === `source:${memberId}`));
      assert.equal(suggestion.questions.find(value => value.id === 'saved-assessments').available, false);
      assert.equal(suggestion.questions.find(value => value.id === 'document-review').available, false);
      assert.equal(captured.length, 0, 'Suggestions must not call the AI provider');
      const context = await post('/assistant/context', { page: 'members', memberId, question: 'Summarize the source facts currently loaded for this member.' });
      assert.equal(context.context.sourceSnapshot.verification, 'INPUT_ONLY_NOT_A_SAVED_ASSESSMENT');
      assert.equal(context.context.sourceSnapshot.facts.payment.proposedBaisa, row.proposedBaisa);
      assert.equal(context.context.sourceSnapshot.facts.contribution.receivedBaisa, row.receivedBaisa);
      assert.equal(context.context.sourceSnapshot.facts.service.overlapMonths, row.overlapMonths);
      assert.equal(context.context.sourceSnapshot.lineage.intendedSourceSystem, input.sourceSystem);
      await post('/assistant/context', { page: 'members', memberId, question: 'Summarize the loaded records.', sourceSnapshot: { payment: 99999999 } }, 'officer', 400);
      await post('/assistant/suggestions', { page: 'members', memberId: 'NONEXISTENT-ACCEPTANCE' }, 'officer', 404);
    });
    const assessment = { ruleIds: published.map(rule => rule.id), assessmentDate: '2026-10-06' };
    await check('All four modules use the imported REST facts, persist native results, and create real findings', async () => {
      const result = await post(`/guided-demo/batches/${batch.id}/assess`, assessment);
      assert.equal(result.createdCount, 4);
      const rows = (await pool.query('SELECT e.*,r.module FROM evaluations e JOIN rules r ON r.id=e.rule_id WHERE e.member_id=$1 ORDER BY r.module', [memberId])).rows;
      assert.equal(rows.length, 4);
      for (const evaluated of rows) {
        assert.equal(evaluated.is_simulation, false);
        assert.ok(evaluated.trace);
        assert.equal(evaluated.source_response.ingestion.batchId, batch.id);
      }
      const byModule = Object.fromEntries(rows.map(value => [value.module, value]));
      assert.equal(byModule.readiness.status, 'READY_FOR_REVIEW');
      assert.equal(byModule.payment.status, 'FINDING');
      assert.equal(byModule.payment.output.differenceBaisa, 125000);
      assert.equal(byModule.contribution.status, 'FINDING');
      assert.equal(byModule.contribution.output.differenceBaisa, 80000);
      assert.equal(byModule.service.status, 'FINDING');
      assert.equal(byModule.service.input.overlapMonths, 2);
      const counts = (await get('/dashboard')).counts;
      assert.equal(counts.evaluations, baseline.evaluations + 4);
      assert.equal(counts.findings, baseline.findings + 3);
      assert.ok(counts.openCases > baseline.openCases);
      const suggestion = await post('/assistant/suggestions', { page: 'payments', memberId });
      const saved = suggestion.questions.find(value => value.id === 'saved-assessments');
      assert.equal(saved.available, true);
      assert.ok(saved.question.includes(byModule.payment.id));
      assert.ok(saved.evidenceRefs.some(value => value.id === byModule.payment.id));
    });
    await check('Repeated batch assessments reuse evidence and do not inflate dashboards', async () => {
      const before = (await get('/dashboard')).counts;
      const repeated = await post(`/guided-demo/batches/${batch.id}/assess`, assessment);
      assert.equal(repeated.createdCount, 0);
      assert.equal(repeated.reusedCount, 4);
      assert.deepEqual((await get('/dashboard')).counts, before);
      assert.equal(await snapshot(), originalMembers);
    });
    await check('Live assessment permissions and source-connection validation cannot be bypassed by guided intake', async () => {
      await post(`/guided-demo/batches/${batch.id}/assess`, assessment, 'designer', 403);
      await post(`/guided-demo/batches/${batch.id}/assess`, assessment, 'auditor', 403);
      await post(`/guided-demo/batches/${batch.id}/assess`, { ...assessment, memberIds: ['M001'] }, 'officer', 422);
      const connectionId = published[0].source.connectionId;
      const before = (await get('/dashboard')).counts;
      await send('PATCH', `/connections/${connectionId}`, { enabled: false, reason: 'Acceptance temporarily disables only the disposable seeded source' }, 'admin');
      await post(`/guided-demo/batches/${batch.id}/assess`, { ...assessment, assessmentDate: '2026-10-07' }, 'officer', 409);
      await send('PATCH', `/connections/${connectionId}`, { enabled: true, reason: 'Restore the disposable source after validation check' }, 'admin');
      assert.deepEqual((await get('/dashboard')).counts, before);
    });
    if (concurrent) await check('Concurrent repeated commit requests resolve to one batch', async () => {
      const responses = await Promise.all([post('/guided-demo/commit', commit), post('/guided-demo/commit', commit)]);
      assert.ok(responses.every(value => value.batch.id === batch.id && value.reused));
    });
    await check('Forecast reads imported expected retirement dates', async () => {
      const forecast = await post('/forecast', { asOfDate: '2026-10-06', horizonMonths: 36, delayMonths: 0 });
      assert.equal(forecast.totalMembers, baseline.members + 1);
      assert.equal(forecast.baselineCount, forecast.scenarioCount);
    });
    // Context and question checks are extended below by the published schema contract.
    const contextInput = { page: 'payments', memberId, question: 'Explain the saved payment difference and show the exact source evidence.' };
    await check('Copilot provider receives real saved assessment evidence and only known citation IDs', async () => {
      const context = await post('/assistant/context', contextInput, 'auditor');
      assert.equal(context.generatedAnswer, false);
      assert.ok(context.context.assessments.some(value => value.output.differenceBaisa === 125000));
      const answer = await post('/assistant', contextInput);
      assert.equal(answer.provider, provider.name);
      assert.ok(captured.length > 0);
      assert.ok(JSON.stringify(captured.at(-1).context).includes('125000'));
      assert.ok(answer.citations.every(value => captured.at(-1).allowedCitationIds.includes(value.id)));
      await post('/assistant', contextInput, 'auditor', 403);
    });
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=';
    const fields = [{ name: 'Acceptance reference', value: 'VERIFIED-ONLY-REF-528', evidence: { page: 1, quote: 'VERIFIED-ONLY-REF-528' }, uncertain: false }];
    let document;
    await check('Document upload and manual transcription retain origin without exposing unverified values to Copilot', async () => {
      document = await post('/documents', { memberId, title: 'Acceptance original source evidence', mimeType: 'image/png', base64: png }, 'officer', 202);
      document = await post(`/documents/${document.id}/transcribe`, { revision: document.revision, fields, reason: 'Explicit synthetic manual transcription for acceptance' });
      assert.equal(document.provider, 'MANUAL_TRANSCRIPTION');
      const context = await post('/assistant/context', { page: 'documents', memberId, question: 'Which document facts are independently verified?' });
      const evidence = context.context.documents.find(value => value.id === document.id);
      assert.equal(evidence.reviewRequired, true);
      assert.deepEqual(evidence.verifiedFields, []);
      assert.ok(!JSON.stringify(context.context).includes('VERIFIED-ONLY-REF-528'));
    });
    await check('Independent verification exposes cited evidence and does not rewrite source facts', async () => {
      await post(`/documents/${document.id}/verify`, { revision: document.revision, fields, reason: 'Uploader must not approve their own evidence' }, 'officer', 403);
      document = await post(`/documents/${document.id}/verify`, { revision: document.revision, fields, reason: 'Independent reviewer compared supplied synthetic original' }, 'reviewer');
      const context = await post('/assistant/context', { page: 'documents', memberId, question: 'Show the verified reference and its original evidence.' });
      assert.equal(context.context.documents.find(value => value.id === document.id).verifiedFields[0].value, fields[0].value);
      assert.ok(context.citations.some(value => value.id === document.id));
      assert.deepEqual((await pool.query('SELECT source_data FROM members WHERE id=$1', [memberId])).rows[0].source_data, imported[0].source_data);
      assert.equal((await get('/dashboard')).counts.verifiedDocuments, baseline.verifiedDocuments + 1);
    });
    await check('All 13 Copilot modules expose questions with real references or explicit prerequisites', async () => {
      for (const page of ['dashboard', 'members', 'readiness', 'forecast', 'documents', 'policy', 'contributions', 'payments', 'cases', 'studio', 'governance', 'workflows', 'integrations']) {
        const scope = ['dashboard', 'forecast', 'policy', 'studio', 'integrations'].includes(page) ? {} : { memberId };
        const result = await post('/assistant/suggestions', { page, ...scope });
        assert.equal(result.page, page);
        assert.ok(result.questions.length > 0, `${page} must have contextual questions`);
        for (const question of result.questions) {
          assert.ok(question.question.length >= 5);
          assert.ok(question.questionAr.length >= 5);
          if (question.available) assert.ok(question.evidenceRefs.length > 0, `${page}/${question.id} lacks evidence`);
          else { assert.ok(question.reason); assert.deepEqual(question.evidenceRefs, []); }
        }
      }
    });
    await check('Draft policy text is excluded and independently published guidance becomes available', async () => {
      let policy = await post('/policies', { title: 'Acceptance Payment Guidance', body: 'Fictional acceptance procedure: independently compare proposed payment with approved entitlement and retain the source evidence.', language: 'en', effectiveFrom: '2026-01-01' }, 'designer', 201);
      const input = { page: 'policy', question: 'What does Acceptance Payment Guidance require?' };
      let context = await post('/assistant/context', input);
      assert.ok(!context.context.policies.some(value => value.id === policy.id));
      policy = await post(`/policies/${policy.id}/publish`, { reason: 'Independent review of fictional acceptance guidance' }, 'reviewer');
      context = await post('/assistant/context', input);
      assert.ok(context.context.policies.some(value => value.id === policy.id));
      assert.ok(context.citations.some(value => value.id === policy.id));
    });
    await check('Governance questions refer to recorded conflicts instead of inventing authority', async () => {
      const conflict = await post('/conflicts', { memberId, fieldName: 'joiningDate', alternatives: [{ source: 'Pension demonstration', value: '1991-03-14' }, { source: 'Employer demonstration', value: '1991-04-14' }] }, 'officer', 201);
      const suggestions = await post('/assistant/suggestions', { page: 'governance', memberId });
      assert.ok(suggestions.questions.find(value => value.id === 'source-conflicts').evidenceRefs.some(value => value.id === `conflict:${conflict.id}`));
      const context = await post('/assistant/context', { page: 'governance', memberId, question: 'Explain the saved source conflict and what is still required.' });
      assert.equal(context.context.sourceGovernance.conflicts.find(value => value.id === conflict.id).status, 'OPEN');
    });
    await check('Saved workflow/task context follows the imported member through independent review', async () => {
      const definitions = (await get('/workflows/definitions', 'designer')).items;
      let definition = definitions.find(value => value.module === 'payment');
      assert.ok(definition);
      definition = await get(`/workflows/definitions/${definition.id}`, 'designer');
      const rule = published.find(value => value.module === 'payment');
      definition = await send('PATCH', `/workflows/definitions/${definition.id}`, { revision: definition.revision, name: definition.name, module: definition.module, xml: definition.xml, bindings: { ...definition.bindings, AssessRule: { ruleId: rule.id } } }, 'designer');
      definition = await post(`/workflows/definitions/${definition.id}/publish`, { revision: definition.revision }, 'reviewer');
      let run = await post('/workflows/instances', { definitionId: definition.id, memberId, assessmentDate: '2026-10-06', businessKey: 'guided-acceptance-imported-member' }, 'officer', 201);
      let context = await post('/assistant/context', { page: 'workflows', memberId, question: 'Explain the current saved workflow progress and pending role.' });
      assert.equal(context.context.workflows.runs[0].id, run.id);
      assert.equal(context.context.workflows.tasks.find(value => value.status === 'PENDING').assignedRole, 'OFFICER');
      let details = await get(`/workflows/instances/${run.id}`);
      let task = details.tasks.find(value => value.status === 'PENDING');
      run = await post(`/workflows/tasks/${task.id}/complete`, { revision: task.revision, decision: 'COMPLETE', note: 'Reviewed imported payment facts and saved finding' });
      details = await get(`/workflows/instances/${run.id}`);
      task = details.tasks.find(value => value.status === 'PENDING');
      run = await post(`/workflows/tasks/${task.id}/complete`, { revision: task.revision, decision: 'APPROVE', note: 'Independent acceptance of evidence for workflow completion' }, 'reviewer');
      assert.equal(run.status, 'COMPLETED');
      context = await post('/assistant/context', { page: 'workflows', memberId, question: 'Explain the completed workflow and distinguish it from ERP posting.' });
      assert.equal(context.context.workflows.runs[0].status, 'COMPLETED');
      assert.ok(context.context.workflows.events.some(value => value.type === 'INSTANCE_COMPLETED'));
      assert.ok(context.citations.some(value => value.id === `workflow:${run.id}`));
      const suggestions = await post('/assistant/suggestions', { page: 'workflows', memberId });
      assert.equal(suggestions.questions.find(value => value.id === 'workflow-review').available, false);
    });
    await check('Missing optional imported values remain missing and cannot produce a false clear result', async () => {
      const minimal = { name: 'Acceptance Missing Inputs', organization: 'Acceptance Pension Source', dateOfBirth: '1968-03-02', dateOfJoining: '1992-04-01', expectedRetirementDate: '2028-03-02' };
      const payload = { ...input, name: 'Missing inputs acceptance', importMethod: 'CSV', fileName: 'acceptance_missing.csv', rows: [minimal] };
      const reviewed = await post('/guided-demo/preview', payload);
      assert.equal(reviewed.valid, true);
      assert.ok(reviewed.warnings.some(value => value.includes('not supplied')));
      const result = await post('/guided-demo/commit', { ...payload, previewHash: reviewed.previewHash, requestId: randomUUID() }, 'officer', 201);
      const assessed = await post(`/guided-demo/batches/${result.batch.id}/assess`, assessment);
      assert.equal(assessed.createdCount, 4);
      const member = result.batch.rows[0];
      const evaluations = (await pool.query('SELECT status,issues FROM evaluations WHERE member_id=$1', [member.memberId])).rows;
      assert.equal(evaluations.length, 4);
      assert.ok(evaluations.every(value => value.status === 'UNABLE_TO_EVALUATE' && value.issues.length > 0));
      assert.deepEqual(member.sourceData.payment, {});
      const questions = await post('/assistant/suggestions', { page: 'payments', memberId: member.memberId });
      assert.equal(questions.questions.find(value => value.id === 'payment-inputs').available, false);
    });
    assert.equal(await snapshot(), originalMembers);
    return { passed: true, runtime, concurrencyTested: concurrent, provider: provider.name, liveAiTested: false, liveOcrTested: false, checks, importedMemberId: memberId, batchId: batch.id };
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a disposable PostgreSQL database; this script does not read .env.');
  assert.notEqual(process.env.NODE_ENV, 'production', 'Acceptance is not permitted in production mode.');
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `pension360_guided_${randomUUID().replaceAll('-', '')}`;
  let pool, created = false;
  try {
    const version = (await admin.query('SHOW server_version')).rows[0].server_version;
    const versionNum = Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num);
    assert.equal(versionNum, 180006, `The release gate requires PostgreSQL 18.6; found ${version}.`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    console.log(JSON.stringify(await runGuidedDemoAcceptance(pool, { runtime: `Native PostgreSQL ${version}` }), null, 2));
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}
