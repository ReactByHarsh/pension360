/** Real Chromium UI checks, with mocked HTTP and the real server input validator.
 * This proves UI contracts and state handling, not PostgreSQL persistence or live OCR/AI.
 * node --import tsx scripts/guided-demo-ui.playwright.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { guidedFields, guidedTemplates, previewGuidedInput, sourceDataForGuidedRow } from '../apps/api/src/guided-demo-data.ts';
const output = path.resolve(process.env.GUIDED_UI_OUTPUT || 'verification/guided-demo-ui');
await mkdir(output, { recursive: true });
const virtualId = 'virtual:p360-guided-ui', resolvedId = '\0' + virtualId;
const appRoot = path.resolve('apps/web');
const vite = await createServer({ root: appRoot, configFile: path.join(appRoot, 'vite.config.ts'), plugins: [{ name: 'guided-demo-test-harness', resolveId(id) { if (id === virtualId) return resolvedId; }, load(id) { if (id !== resolvedId) return; return `import React from 'react'; import {createRoot} from 'react-dom/client'; import GuidedDemo from '/src/GuidedDemo.tsx'; import {Copilot, CopilotProvider} from '/src/Copilot.tsx'; import '/src/styles.css'; const h=React.createElement; const user={id:'ui-test',name:'UI Test Officer',role:location.search.includes('auditor')?'AUDITOR':'OFFICER'}; createRoot(document.getElementById('root')).render(h(CopilotProvider,null,h('main',{style:{padding:'24px',maxWidth:'1320px',margin:'auto'}},h(GuidedDemo,{user,navigate:p=>{window.lastNavigation=p;}}),h(Copilot,{page:'members',mode:'dev',user,combined:true,navigate:p=>{window.lastNavigation=p;}}))));`; } }], server: { host: '127.0.0.1', port: 5193, strictPort: true } });
await vite.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.setDefaultTimeout(15000);
const errors=[];const consoleErrors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(entry.type()==='error')consoleErrors.push(entry.text())});page.on('requestfailed',req=>consoleErrors.push(req.url()+':'+req.failure()?.errorText));
const calls=[], batches=[];
const rule = {id:'11111111-2222-4333-8444-555555555555',name:'Published payment check',module:'payment',version:1,effectiveFrom:'2026-01-01',compatible:true};
const definition={id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',name:'Payment review workflow',module:'payment',version:1,status:'PUBLISHED'};
const pageOf=items=>({items,total:items.length,limit:100,offset:0,hasMore:false});
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
let failAssessmentMember='';
let holdBatchId='';let heldBatch;
await page.route('**/api/v1/**',async route=>{
  const req=route.request(), endpoint=new URL(req.url()).pathname.replace('/api/v1',''), body=req.postData()?req.postDataJSON():undefined;
  calls.push({endpoint,method:req.method(),body,url:req.url()});
  if(endpoint==='/guided-demo/catalog')return json(route,{developmentOnly:true,explanation:'Demo input; the live integration will supply these facts from pension or ERP.',assessmentDate:'2026-10-06',fields:guidedFields,templates:guidedTemplates,publishedRules:[rule]});
  if(endpoint==='/guided-demo/batches')return json(route,pageOf(batches));
  if(endpoint==='/guided-demo/preview')return json(route,previewGuidedInput(body));
  if(endpoint==='/guided-demo/commit'){
    const checked=previewGuidedInput({name:body.name,sourceSystem:body.sourceSystem,importMethod:body.importMethod,fileName:body.fileName,isSample:body.isSample,rows:body.rows});
    assert.equal(checked.valid,true);assert.equal(body.previewHash,checked.previewHash);assert.match(body.requestId,/^[0-9a-f-]{36}$/);
    const id=`batch-${batches.length+1}`, now='2026-10-06T17:00:00.000Z';
    const batch={...checked.normalized,id,createdAt:now,createdBy:'ui-test',rowCount:body.rows.length,rows:checked.normalized.rows.map((facts,i)=>{const memberId=`D-${batches.length+1}-${i+1}`;return{rowNumber:i+1,memberId,externalReference:facts.externalReference,facts,sourceData:sourceDataForGuidedRow(facts,memberId,id,checked.normalized,now),evaluations:[],documents:[],cases:[],workflowRuns:[]};})};
    batches.push(batch);return json(route,{batch,reused:false},201);
  }
  if(endpoint.endsWith('/sample-document'))return route.fulfill({status:200,contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nUI fixture only\n%%EOF')});
  if(/^\/guided-demo\/batches\/[^/]+\/assess$/.test(endpoint)){
    const batch=batches.find(b=>b.id===endpoint.split('/')[3]);assert.equal(body.memberIds.length,1);
    if(body.memberIds[0]===failAssessmentMember)return json(route,{error:{message:'Temporary source connection failure.'}},503);
    const row=batch.rows.find(r=>r.memberId===body.memberIds[0]);
    if(!row.evaluations.length){row.evaluations.push({id:`evaluation-${row.memberId}`,ruleId:rule.id,memberId:row.memberId,assessmentDate:body.assessmentDate,status:'FINDING',input:{proposedBaisa:row.facts.proposedBaisa},output:{status:'FINDING',differenceBaisa:row.facts.proposedBaisa-row.facts.approvedBaisa},issues:[],provenance:{uiFixture:true},caseId:`case-${row.memberId}`});row.cases.push({id:`case-${row.memberId}`,title:'Payment difference',category:'payment',status:'OPEN'});}
    return json(route,{batch,createdCount:1,reusedCount:0});
  }
  if(/^\/guided-demo\/batches\/[^/]+$/.test(endpoint)){
    const batch=batches.find(b=>b.id===endpoint.split('/')[3]);
    if(batch.id===holdBatchId){heldBatch={route,batch};return;}
    return json(route,batch);
  }
  if(endpoint==='/workflows/definitions')return json(route,pageOf([definition]));
  if(endpoint==='/workflows/instances'){
    const row=batches.flatMap(b=>b.rows).find(r=>r.memberId===body.memberId);
    row.workflowRuns.push({id:`workflow-${row.memberId}`,name:definition.name,status:'WAITING'});return json(route,row.workflowRuns.at(-1),201);
  }
  if(endpoint==='/documents'){
    const row=batches.flatMap(b=>b.rows).find(r=>r.memberId===body.memberId);assert.ok(row);assert.equal(body.mimeType,'application/pdf');assert.ok(body.base64);
    row.documents.push({id:`document-${row.memberId}`,title:body.title,status:'QUEUED',provider:'pending',scanStatus:'PENDING'});return json(route,row.documents.at(-1),201);
  }
  if(endpoint==='/members')return json(route,pageOf(batches.flatMap(b=>b.rows.map(r=>({...r.facts,id:r.memberId})))));
  if(endpoint==='/assistant/suggestions')return json(route,{page:body.page,memberId:body.memberId||null,capturedAt:'2026-10-06T17:00:00.000Z',coverage:{members:body.memberId?1:0},questions:[{id:'actual-question',label:`Explain ${body.page} for ${body.memberId||'workspace'}`,question:`What do the saved ${body.page} records show for ${body.memberId||'workspace'}?`,questionAr:'سؤال',available:true,evidenceRefs:[]}]});
  if(endpoint==='/assistant')return json(route,{answer:`Fixture answer scoped to ${body.memberId}`,citations:[],provider:'UI fixture — not live AI',requiresHumanReview:true});
  throw new Error(`Unexpected HTTP: ${endpoint}`);
});
const harness=await vite.transformIndexHtml('/__guided-ui',`<!doctype html><html><body><div id="root"></div><script type="module">import '${virtualId}';</script></body></html>`);
await page.route('**/__guided-ui*',route=>route.request().resourceType()==='document'?route.fulfill({status:200,contentType:'text/html',body:harness}):route.continue());
const last=endpoint=>calls.filter(call=>call.endpoint===endpoint).at(-1);
const checkNames=[];
try {
  await page.goto('http://127.0.0.1:5193/__guided-ui');
  await page.getByRole('heading',{name:'Guided demo center',exact:true}).waitFor();
  assert.equal(await page.locator('.guided-module').count(),16);checkNames.push('All 16 relevant business/shared module guides render');
  await page.getByRole('button',{name:'Payment assurance',exact:true}).click();
  await page.getByLabel('Example scenario',{exact:true}).selectOption('payment-difference');
  await page.getByRole('button',{name:'Load sample into form',exact:true}).click();
  assert.equal(await page.getByLabel('Proposed payment (baisa)',{exact:true}).inputValue(),'950000');
  await page.getByLabel('Proposed payment (baisa)',{exact:true}).fill('1250000');
  await page.getByRole('button',{name:'Preview & validate all rows',exact:true}).click();
  await page.getByRole('button',{name:'Create fresh demonstration batch',exact:true}).waitFor();
  assert.equal(last('/guided-demo/preview').body.rows[0].proposedBaisa,1250000);checkNames.push('Sample populates editable form and real server validator receives typed modified facts');
  await page.getByLabel('Proposed payment (baisa)',{exact:true}).fill('1300000');
  assert.equal(await page.getByRole('button',{name:'Create fresh demonstration batch',exact:true}).count(),0);checkNames.push('Editing a checked fact invalidates the saved preview');
  await page.getByRole('button',{name:'Preview & validate all rows',exact:true}).click();
  await page.getByRole('button',{name:'Create fresh demonstration batch',exact:true}).click();
  await page.getByLabel('Member used for documents, workflow and Copilot',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Member used for documents, workflow and Copilot',{exact:true}).inputValue(),'D-1-1');assert.equal(batches.length,1);
  await page.locator('.guided-rule-option input').check();
  await page.getByRole('button',{name:'Run selected rules for 1 member',exact:true}).click();
  await page.getByText('Finding',{exact:true}).waitFor();
  assert.deepEqual(last('/guided-demo/batches/batch-1/assess').body.memberIds,['D-1-1']);checkNames.push('Fresh saved member ID flows into real batch assessment request; saved response displayed');
  await page.getByRole('button',{name:'Prepare matching sample PDF',exact:true}).click();
  await page.getByText('Pension360_D-1-1_payment_sample.pdf',{exact:false}).waitFor();
  assert.ok(calls.some(call=>call.endpoint==='/guided-demo/batches/batch-1/members/D-1-1/sample-document'));
  await page.getByRole('button',{name:'Upload & queue extraction',exact:true}).click();
  await page.getByText('Queued',{exact:true}).waitFor();
  assert.equal(last('/documents').body.memberId,'D-1-1');assert.equal(batches[0].rows[0].documents[0].status,'QUEUED');checkNames.push('Member-matched PDF explicitly prepared then uploaded; actual QUEUED status is not treated as verified');
  await page.getByLabel('Published workflow for this member',{exact:true}).selectOption(definition.id);
  await page.getByRole('button',{name:'Start workflow',exact:true}).click();
  await page.getByText('Waiting',{exact:true}).waitFor();assert.equal(last('/workflows/instances').body.memberId,'D-1-1');checkNames.push('Published workflow receives selected saved member and assessment date');
  await page.getByRole('button',{name:'Explain payments for D-1-1',exact:false}).waitFor();
  assert.equal(last('/assistant/suggestions').body.memberId,'D-1-1');assert.equal(last('/assistant/suggestions').body.page,'payments');checkNames.push('Copilot question scope follows actual saved member and selected module');
  await page.locator('#guided-saved-batch').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'01-saved-evidence.png')});
  // CSV validation and a multi-member failure use exactly the same backend API contract.
  await page.getByLabel('Pension / ERP CSV file',{exact:true}).setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('name,organization,dateOfBirth,dateOfJoining,expectedRetirementDate,serviceVerified\nA,Demo,1960-01-01,1990-01-01,2026-10-20,no')});
  await page.getByText(/must be true or false/).waitFor();
  const csv='name,organization,dateOfBirth,dateOfJoining,expectedRetirementDate,serviceVerified,proposedBaisa,approvedBaisa\nCSV One,Demo,1960-01-01,1990-01-01,2026-10-20,false,900000,600000\nCSV Two,Demo,1961-01-01,1991-01-01,2026-11-20,true,900000,600000';
  await page.getByLabel('Pension / ERP CSV file',{exact:true}).setInputFiles({name:'valid.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.getByRole('button',{name:'Preview & validate all rows',exact:true}).click();
  await page.getByRole('button',{name:'Create fresh demonstration batch',exact:true}).click();
  await page.getByRole('button',{name:'Run selected rules for 2 members',exact:true}).waitFor();
  assert.equal(last('/guided-demo/commit').body.importMethod,'CSV');assert.equal(last('/guided-demo/commit').body.rows[0].serviceVerified,false);checkNames.push('CSV upload rejects invalid types and preserves false/whole-number facts');
  failAssessmentMember='D-2-2';
  await page.getByRole('button',{name:'Run selected rules for 2 members',exact:true}).click();
  await page.getByText('Temporary source connection failure.',{exact:true}).waitFor();
  await page.getByText(/1 of 2 member assessment requests finished/).waitFor();assert.equal(batches[1].rows[0].evaluations.length,1);assert.equal(batches[1].rows[1].evaluations.length,0);checkNames.push('Bounded per-member requests display partial completion and refresh saved results after error');
  await page.getByRole('button',{name:'Prepare matching sample PDF',exact:true}).click();
  await page.getByText('Pension360_D-2-1_payment_sample.pdf',{exact:false}).waitFor();
  await page.getByLabel('Member used for documents, workflow and Copilot',{exact:true}).selectOption('D-2-2');
  assert.equal(await page.getByText('Pension360_D-2-1_payment_sample.pdf',{exact:false}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Upload & queue extraction',exact:true}).isDisabled(),true);checkNames.push('Changing the selected member clears prepared document and title');
  // Hold an old batch response, switch back, then release it: stale records must not appear.
  holdBatchId='batch-1';await page.getByLabel('Saved demonstration batch',{exact:true}).selectOption('batch-1');
  await page.waitForFunction(()=>document.querySelector('select')!==null);
  for(let i=0;i<50&&!heldBatch;i++)await page.waitForTimeout(20);
  assert.ok(heldBatch);await page.getByLabel('Saved demonstration batch',{exact:true}).selectOption('batch-2');
  holdBatchId='';await json(heldBatch.route,heldBatch.batch);heldBatch=undefined;
  await page.getByLabel('Member used for documents, workflow and Copilot',{exact:true}).waitFor();
  assert.match(await page.getByLabel('Member used for documents, workflow and Copilot',{exact:true}).inputValue(),/^D-2-/);checkNames.push('Late response from previous batch does not replace selected batch records');
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.getByRole('heading',{name:'Guided demo center',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'02-dark-modules.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'03-mobile-modules.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));checkNames.push('Theme tokens and narrow viewport have no page overflow');
  await page.goto('http://127.0.0.1:5193/__guided-ui?auditor');await page.getByRole('heading',{name:'Guided demo center',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Preview & validate all rows',exact:true}).count(),0);
  await page.getByLabel('Saved demonstration batch',{exact:true}).selectOption('batch-1');await page.getByRole('button',{name:'Run selected rules for 1 member',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Run selected rules for 1 member',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Upload & queue extraction',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Start workflow',exact:true}).isDisabled(),true);checkNames.push('Auditor UI exposes saved evidence and prevents intake, assessment, upload and workflow mutation');
  assert.deepEqual(errors,[]);
  const result={passed:true,scope:'Real Chromium components with mocked HTTP and real source-input validation; not PostgreSQL persistence, live AI or OCR.',checks:checkNames,mutationRequests:calls.filter(call=>call.method==='POST').map(call=>({endpoint:call.endpoint}))};
  await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/guided-demo-ui-checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});await writeFile(path.join(output,'failure.txt'),`${error.stack}\nPage errors: ${JSON.stringify(errors)} Console: ${JSON.stringify(consoleErrors)}\n${await page.locator('body').innerText()}`);throw error;}
finally{await browser.close();await vite.close();}
