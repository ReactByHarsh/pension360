import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Database, GitBranch, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import type { User, Rule, List } from '../types';
import { Studio } from '../Studio';
import Governance from '../Governance';
import UserAccess from '../UserAccess';
import IntegrationCenter from '../IntegrationCenter';
import { DemoCenter, RolesAccess } from '../DemoCenter';
import { Operations, Policies } from '../Modules';
import { Panel, Field, DataTable, ErrorBox, Loading, Badge, ListMore, useResource } from '../ui';
import { allowedScreen, groups, legacyTarget, screens, studioPages, studioTab } from './navigation';

const connectionsPages=['connectors','connector-new','studio-sources'];
const sourcePages=['discovery','mapping','validation','studio-mapping'];
const syncPages=['data-integrations','sync','publish'];
const adminPages=['source-governance','background-jobs','roles','demo-center','demo-guide','prototype-scope','knowledge','access','ai-settings','audit','settings','screen-map','health','replay','odoo',...connectionsPages,...sourcePages,...syncPages,...studioPages];
export const isAdministrationPage=(page:string)=>adminPages.includes(page);
type Props={page:string;user:User;mode:'dev'|'oidc';navigate:(page:string)=>void;dark:boolean;switchUser:(id:string)=>Promise<void>;refreshSession:()=>Promise<void>};

/** Original integration, Studio and administration screens connected to Node workflows. */
export function AdministrationPages({page,user,mode,navigate,dark,switchUser,refreshSession}:Props) {
  const legacy=(target:string)=>navigate(legacyTarget(target));
  if(page==='access')return <UserAccess user={user} refreshSession={refreshSession}/>;
  if(page==='roles')return <RolesAccess user={user} mode={mode} navigate={legacy}/>;
  if(page==='audit'||page==='background-jobs'||page==='replay')return <Operations tab={page==='audit'?'audit':'jobs'} user={user}/>;
  if(page==='source-governance')return <Governance user={user}/>;
  if(page==='knowledge')return <Policies user={user}/>;
  if(page==='demo-center')return mode==='dev'?<DemoCenter user={user} switchUser={switchUser} navigate={legacy}/>:null;
  if(syncPages.includes(page))return <IntegrationCenter user={user} mode={mode} navigate={legacy}/>;
  if(connectionsPages.includes(page))return <Studio user={user} dark={dark} view="connections"/>;
  if(studioPages.includes(page)||sourcePages.includes(page))return <StudioWorkspace {...{page,user,dark,navigate}}/>;
  if(page==='ai-settings')return <ProviderStatus/>;
  if(page==='health')return <><Panel title="Connection and processing health"><p>Review connection settings and recorded job results. An enabled connection does not prove that its upstream system is currently available.</p><div className="actions"><button className="secondary" onClick={()=>navigate('connectors')}>Registered connections <Database size={16}/></button><button className="secondary" onClick={()=>navigate('data-integrations')}>Synchronization history <ArrowRight size={16}/></button></div></Panel><Operations tab="jobs" user={user}/></>;
  if(page==='odoo')return <><Panel title="Odoo pension / ERP connection"><p>Use your approved Odoo REST adapter as a registered connection. Member facts are selected visually in Rules & Data Studio; roster and PDF intake use Data synchronization.</p><p className="hint">Configure the adapter's authenticated read endpoints with the ERP owner. This release does not include the Java project's Odoo-specific discovery or direct-database connector.</p><div className="actions"><button className="primary" onClick={()=>navigate('connectors')}>Configure REST connection</button><button className="secondary" onClick={()=>navigate('data-integrations')}>Preview member and document intake</button></div></Panel><Studio user={user} dark={dark} view="connections"/></>;
  if(page==='screen-map')return <ScreenIndex user={user} mode={mode} navigate={navigate}/>;
  if(page==='settings')return <><Panel title="Workspace preferences"><p>Use the theme and right-to-left controls in the header. Display preferences stay in this browser.</p><p>Organization sign-in, document encryption, malware scanning and the model provider are configured by your deployment administrator. Secrets are never entered into a business rule or exposed in this screen.</p><div className="actions"><button className="secondary" onClick={()=>navigate('roles')}>Roles & responsibilities <ShieldCheck size={16}/></button>{allowedScreen('ai-settings',user.role,mode)&&<button className="secondary" onClick={()=>navigate('ai-settings')}>Inspect AI provider</button>}{user.role==='SUPER_ADMIN'&&<button className="primary" onClick={()=>navigate('access')}>Manage users & roles</button>}</div></Panel><Panel title="Organization workspace"><p>Records are shared within this application. Roles govern actions and independent review. Department-based access and password administration from the earlier Java backend are not enabled here; identity authentication is provided by organization SSO.</p></Panel></>;
  if(page==='prototype-scope')return <><Panel title="Connected solution scope"><p>The original v6.2 logo, grouped navigation and screen structure now use the Node.js / Express API and PostgreSQL. REST-backed assessments, JDM configuration, evidence verification, governed cases and source synchronization are connected workflows.</p><p>Separate task records, historical conversations, financial ledgers and capacity models from the Java backend have not been ported. Their navigation entries explain the available workflow and its boundary. No missing service is represented by generated records.</p><button className="secondary" onClick={()=>navigate('screen-map')}>Explore the screen index</button></Panel><Guide {...{user,mode,navigate}}/></>;
  return <Guide {...{user,mode,navigate}}/>;
}
function StudioWorkspace({page,user,dark,navigate}:{page:string;user:User;dark:boolean;navigate:(page:string)=>void}) {
  const params=new URLSearchParams(location.hash.split('?')[1]||location.search);
  const ruleId=params.get('rule')||params.get('v')||'';
  const models=useResource<List<Rule>>('/rules');
  if(page==='rule-ai')return <><Panel title="AI rule drafting guidance"><p>Ask the page Copilot to explain mapped inputs, published procedures or an observed decision. Review its citations, then configure the actual rule in the visual designer.</p><p className="hint">Copilot guidance does not create, approve or publish decision graphs. The Java backend's automatic draft-generation job has not been ported.</p><button className="primary" onClick={()=>navigate('rule-designer'+(ruleId?'?rule='+encodeURIComponent(ruleId):''))}>Open visual designer <GitBranch size={16}/></button></Panel></>;
  const step=(target:string)=>navigate(target+(ruleId?'?rule='+encodeURIComponent(ruleId):''));
  return <>
    <Panel title="Rules & Data Studio">
      <p>Connect source fields, test the decision and publish through independent review. Select a version to keep it open while moving between the original Studio screens.</p>
      <ErrorBox error={models.error}/>
      <Field label="Decision version"><select value={ruleId} onChange={e=>navigate(page+(e.target.value?'?rule='+encodeURIComponent(e.target.value):''))}><option value="">Decision catalogue</option>{ruleId && !models.data?.items.some(rule=>rule.id===ruleId) && <option value={ruleId}>Linked decision version · {ruleId}</option>}{models.data?.items.map(rule=><option value={rule.id} key={rule.id}>{rule.name} · v{rule.version} · {rule.status}</option>)}</select></Field>
      <ListMore query={models} label="decision versions"/>
      <div className="actions">{[['rule-input','Fetch input'],['studio-mapping','Map fields'],['rule-designer','Design'],['rule-test','Test & explain'],['rule-impact','Impact'],['rule-versions','Publish & versions']].map(([id,label])=><button key={id} className={page===id?'primary':'secondary'} aria-current={page===id?'page':undefined} onClick={()=>step(id)}>{label}</button>)}</div>
    </Panel>
    <Studio user={user} dark={dark} initialTab={studioTab(page)} initialRuleId={ruleId||undefined} onSelectRule={id=>navigate(page+(id?'?rule='+encodeURIComponent(id):''))}/>
  </>;
}
function ProviderStatus(){
  const [provider,setProvider]=useState<string>();const [error,setError]=useState<Error|null>(null);
  useEffect(()=>{const controller=new AbortController();api<{provider:string}>('/assistant/context',{page:'dashboard',question:'Inspect configured provider',language:'en'},'POST',controller.signal).then(result=>setProvider(result.provider)).catch(err=>{if(err.name!=='AbortError')setError(err);});return()=>controller.abort();},[]);
  return <><Panel title="AI provider configuration"><ErrorBox error={error}/>{!provider&&!error?<Loading text="Reading provider status…"/>:provider&&<p>Current provider: <Badge value={provider}/></p>}<p>This reads the configured provider name without generating an answer or sending evidence to AI. Availability, extraction quality and model access must be checked using a live request in the configured deployment.</p></Panel><Panel title="Connection responsibilities"><ol><li>The administrator configures the API key and model on the server.</li><li>OpenAI receives approved requests directly from Node.js.</li><li>An OpenAI-compatible provider can replace the text endpoint later; document vision needs a validated adapter.</li><li>Uploaded fields remain unverified until an independent reviewer checks the original evidence.</li></ol></Panel></>;
}
function ScreenIndex({user,mode,navigate}:{user:User;mode:'dev'|'oidc';navigate:(page:string)=>void}) {
  const [search,setSearch]=useState('');const rows=screens.filter(s=>allowedScreen(s.id,user.role,mode)&&`${s.title} ${s.group}`.toLowerCase().includes(search.toLowerCase()));
  return <Panel title="Screen & flow index"><Field label="Find a screen"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Screen or module name"/></Field><p>{rows.length} screens available for your role. Related screens share governed workflows and retain the original navigation.</p><DataTable label="Available workspace screens" rows={rows} columns={[{key:'title',label:'Screen'},{key:'group',label:'Module',render:r=>groups.find(g=>g.id===r.group)?.label||r.group}]} onRow={r=>navigate(r.id)}/></Panel>;
}
function Guide({user,mode,navigate}:{user:User;mode:'dev'|'oidc';navigate:(page:string)=>void}) {
  const steps=[['executive','1. Review the dashboard','Inspect the actual member, readiness and case totals.'],['demo-center','2. Prepare the demo files','Choose fictional PDFs and read the scenario notes.'],['data-integrations','3. Synchronize source data','Preview one new member, two updates and two PDFs before committing.'],['assessments','4. Run the published rules','Use fresh REST facts and preserve each assessment.'],['extraction','5. Verify document evidence','Transcribe or extract fields and hand them to an independent reviewer.'],['rule-designer','6. Configure a rule visually','Change a draft, run scenarios, then submit it for independent publication.'],['copilot','7. Explain with Copilot','Preview the evidence, then ask the configured model.'],['reports','8. Show the review report','Read the immutable assessments and the case decision together.']];
  return <Panel title="Guided demonstration"><div className="original-guide-grid">{steps.filter(([id])=>allowedScreen(id,user.role,mode)).map(([id,title,description])=><button className="original-guide-step" onClick={()=>navigate(id)} key={id}><CheckCircle2 size={22}/><strong>{title}</strong><span>{description}</span><ArrowRight size={18}/></button>)}</div></Panel>;
}
