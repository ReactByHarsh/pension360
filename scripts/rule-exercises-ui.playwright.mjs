/**
 * Real Chromium + actual JDM canvas, with explicitly mocked HTTP/repository responses.
 * Verifies UI requests, feedback and designer import; not PostgreSQL persistence.
 * node --import tsx scripts/rule-exercises-ui.playwright.mjs
 * Starts an isolated Vite preview unless RULE_EXERCISES_UI_URL supplies an existing one.
 * Optional CHROMIUM_EXECUTABLE_PATH points to an existing Chromium executable.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { ruleExercises, exerciseFixture, exerciseAssertions } from '../apps/api/src/rule-exercises.ts';
import { evaluateGraph } from '../apps/api/src/engine.ts';
import { applyMappings } from '../apps/api/src/source.ts';
import { ruleSchema } from '../apps/api/src/validation.ts';
import { CONNECTION_ID } from '../apps/api/src/seed.ts';
const suppliedUrl = process.env.RULE_EXERCISES_UI_URL || process.env.RULE_UI_URL;
const baseUrl = suppliedUrl || 'http://127.0.0.1:5188';
const output = path.resolve(process.env.RULE_UI_OUTPUT || 'verification/rule-ui');
await mkdir(output, { recursive: true });
let vite;
if(!suppliedUrl || process.env.RULE_UI_START_SERVER === '1') {
  const { createServer } = await import('vite');
  vite = await createServer({ root: path.resolve('apps/web'), configFile: path.resolve('apps/web/vite.config.ts'), server: { host: '127.0.0.1', port: Number(new URL(baseUrl).port), strictPort: true } });
  await vite.listen();
}
const catalog = ruleExercises();
const now = '2026-10-06T12:00:00.000Z';
let user = { id: 'designer', name: 'Demo designer', role: 'DESIGNER' };
let failNextRun = false;
let mismatchNextRun = false;
const models = [];
const calls = [];
const errors = [];
const browserConsole = [];
const pageOf = items => ({ items, total: items.length, limit: 100, offset: 0, hasMore: false });
async function nativeUiFixture(exercise, body) {
  const selected = exercise.scenarios.filter(s => !body.scenarioIds || body.scenarioIds.includes(s.id));
  const results = [];
  for(const s of selected) {
    const fixture = exerciseFixture(exercise.id, s.memberId);
    const mapped = applyMappings(fixture.body, exercise.config.mappings, s.assessmentDate);
    const issues = fixture.statusCode === 503 ? [{ code: 'SOURCE_HTTP_ERROR', message: 'Source returned HTTP 503' }] : mapped.issues;
    const native = issues.length ? { result: {}, trace: null } : await evaluateGraph(exercise.config.graph, mapped.input);
    if(mismatchNextRun && s.id === 'at-senior') native.result.route = 'OFFICER_REVIEW';
    const evaluation = { id: randomUUID(), ruleId: body.ruleId ?? 'catalog', memberId: s.memberId, assessmentDate: s.assessmentDate, status: native.result.status ?? 'UNABLE_TO_EVALUATE', input: mapped.input, output: native.result, trace: native.trace, sourceResponse: fixture.statusCode === 200 ? fixture.body : null, provenance: { simulation: true, uiTestFixture: true }, issues, createdAt: now };
    const checks = exerciseAssertions(s,evaluation);
    results.push({ scenarioId: s.id, name: s.name, memberId: s.memberId, passed: checks.every(c=>c.passed), checks, evaluation, durationMs: 1 });
  }
  mismatchNextRun=false;
  return { id: randomUUID(), exerciseId: exercise.id, title: exercise.title, ruleId: body.ruleId ?? null, mode: body.ruleId ? 'saved-model-simulation' : 'catalog-simulation', generatedAt: now, durationMs: 12, passed: results.every(r=>r.passed), passedCount: results.filter(r=>r.passed).length, total: results.length, results };
}
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}), args:['--no-sandbox','--disable-dev-shm-usage'] });
const context = await browser.newContext({viewport:{width:1512,height:1050}});
const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')browserConsole.push(m.text());});
await page.route('**/api/v1/**',async route=>{
  const req=route.request();const endpoint=new URL(req.url()).pathname.replace('/api/v1','');const body=req.postData()?req.postDataJSON():undefined;calls.push({endpoint,method:req.method(),body});
  let data;
  try {
    if(endpoint==='/session')data={mode:'dev',user};
    else if(endpoint==='/rule-exercises')data={items:catalog,available:true,assessmentDate:'2026-10-06'};
    else if(endpoint.startsWith('/rule-exercises/')&&endpoint.endsWith('/run')) {
      if(failNextRun){failNextRun=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'ENGINE_BUSY',message:'Exercise service unavailable. Retry shortly.'}})});return;}
      data=await nativeUiFixture(catalog.find(e=>e.id===endpoint.split('/')[2]),body);
    }
    else if(endpoint==='/connections')data=pageOf([{id:CONNECTION_ID,name:'Fictional pension REST source',baseUrl:'http://127.0.0.1:4000',enabled:true}]);
    else if(endpoint==='/members')data=pageOf(Array.from({length:12},(_,i)=>({id:`M${String(i+1).padStart(3,'0')}`,name:`Fictional member ${i+1}`,dateOfBirth:'1966-10-06',dateOfJoining:'1990-01-01',organization:'Demonstration'})));
    else if(endpoint==='/rules'&&req.method()==='POST') {
      ruleSchema.parse(body);
      const copy={...body,id:randomUUID(),familyId:randomUUID(),version:1,revision:1,status:'DRAFT',createdBy:user.id,authorIds:[user.id],createdAt:now,updatedAt:now};models.push(copy);data=copy;
    }
    else if(endpoint==='/rules')data=pageOf(models);
    else if(/^\/rules\/[\w-]+$/.test(endpoint))data=models.find(r=>r.id===endpoint.split('/')[2]);
    else if(endpoint==='/demo/copilot')data={fictional:true,asOfDate:'2026-10-06',pages:[],members:[],policies:[],policyStatus:{published:0,draft:0,retired:0}};
    else if(endpoint==='/rule-assistant/status')data={available:false};
    else data=pageOf([]);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:e.message}})});}
});
try {
  await page.goto(`${baseUrl}/#rule-use-cases`);
  await page.getByRole('heading',{name:'Rule exercise lab',exact:true}).waitFor();
  assert.equal(await page.locator('.rule-exercise-choice').count(),9);
  await page.getByRole('button',{name:/payment · 12 scenarios Payment tolerance/}).click();
  await page.getByRole('button',{name:'Run all 12 scenarios',exact:true}).click();
  await page.getByRole('heading',{name:'Latest run: 12 / 12 passed',exact:true}).waitFor();
  await page.getByLabel('Inspect result',{exact:true}).selectOption('missing-approval');
  await page.getByText('Native ZEN execution trace',{exact:true}).click();
  await page.getByText('No graph trace:',{exact:false}).waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export evidence',exact:true}).click();assert.match((await download).suggestedFilename(),/^Pension360_payment-routing_.+\.json$/);
  await page.screenshot({path:path.join(output,'01-run-evidence.png'),fullPage:true});

  await page.getByRole('button',{name:'Run this sample',exact:true}).first().click();
  await page.getByRole('heading',{name:'Latest run: 1 / 1 passed',exact:true}).waitFor();
  assert.deepEqual(calls.filter(c=>c.endpoint==='/rule-exercises/payment-routing/run').at(-1).body.scenarioIds,['large']);

  mismatchNextRun=true;
  await page.getByRole('button',{name:'Run all 12 scenarios',exact:true}).click();
  await page.getByRole('heading',{name:'Latest run: 11 / 12 passed',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Inspect result',{exact:true}).inputValue(),'at-senior');
  assert.equal(await page.locator('.rule-exercise-result.fail').count(),1);
  failNextRun=true;
  await page.getByRole('button',{name:'Run all 12 scenarios',exact:true}).click();
  await page.getByText('Exercise service unavailable. Retry shortly.',{exact:true}).first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Run all 12 scenarios',exact:true}).isEnabled(),true);

  await page.getByRole('button',{name:'Create draft & open designer',exact:true}).click();
  await page.waitForURL(/#rule-designer\?rule=/);
  await page.getByText('Payment review branches',{exact:true}).waitFor();
  assert.equal(models.length,1);assert.equal(models[0].status,'DRAFT');
  assert.ok(models[0].graph.nodes.some(n=>n.type==='switchNode'));
  await page.getByText('Payment review branches',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'02-native-designer.png'),fullPage:false});

  // Check dark-mode tokens on the actual lab page, then verify reviewer-only affordances.
  await page.evaluate(()=>{localStorage.setItem('p360-theme','dark');});
  user={id:'reviewer',name:'Demo reviewer',role:'REVIEWER'};
  await page.goto(`${baseUrl}/#rule-use-cases`);await page.reload();await page.getByRole('heading',{name:'Rule exercise lab',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Create draft & open designer',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  assert.notEqual(await page.locator('.rule-exercise-choice').nth(1).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.screenshot({path:path.join(output,'03-reviewer-dark.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const result={passed:true,scope:'Real Chromium and actual JDM canvas; mocked HTTP/repository state with native graph results for UI fixtures. Not PostgreSQL persistence.',checks:['9 use cases load','12 scenario results and evidence export','single sample sends selected scenario ID','expected error/no-trace explanation','regression mismatch visible','503 request failure feedback and retry enabled','valid separate draft POST','real JDM switch graph opens','reviewer has no create action','dark mode follows application tokens'],mutationRequests:calls.filter(c=>c.method!=='GET').map(c=>({method:c.method,endpoint:c.endpoint}))};
  await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
  await mkdir('docs/verification',{recursive:true});
  await writeFile('docs/verification/rule-exercises-ui-checks.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});await writeFile(path.join(output,'failure.txt'),`${e.stack}\nBrowser errors: ${JSON.stringify(errors)}\nConsole: ${JSON.stringify(browserConsole)}\n${await page.locator('body').innerText()}`);throw e;}
finally{await browser.close();await vite?.close();}
