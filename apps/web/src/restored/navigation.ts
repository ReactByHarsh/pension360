import manifest from './screen-manifest.json';
import { canNavigate, type Page } from '../roles';
import type { Role } from '../types';
import type { CopilotPage } from '../copilot-context';

export type Screen = {id:string;title:string;group:string};
export const screens: Screen[] = [...manifest.screens,
  {id:'source-governance',title:'Source authority & conflicts',group:'Shared · Integrations'},
  {id:'data-integrations',title:'Data synchronization',group:'Shared · Integrations'},
  {id:'background-jobs',title:'Background jobs',group:'Shared · Administration'},
  {id:'roles',title:'Roles & responsibilities',group:'Shared · Administration'},
  {id:'demo-center',title:'Demo center & sample PDFs',group:'Demo & Handoff'},
];
const names: Record<string,string> = {
  '01 · Retirement Readiness & Forecasting':'Retirement readiness',
  '02 · AI Case & Document Intelligence':'Cases & documents',
  '03 · Policy & Decision Intelligence':'Policy intelligence',
  '04 · Contribution & Service Assurance':'Contribution & service',
  '05 · Payment & Entitlement Assurance':'Payment assurance',
  'Shared · Analytics':'Analytics','Shared · AI & Member 360':'AI & Member 360',
  'Shared · Work & Reports':'Work & reports','Shared · Rules & Data Studio':'Rules & Data Studio',
  'Shared · Integrations':'Integrations','Shared · Administration':'Administration','Demo & Handoff':'Demo & handoff',
};
export const groups = [...new Set(screens.map(s=>s.group))].map((group,index)=>({id:group,label:names[group]||group,index,items:screens.filter(s=>s.group===group)}));
export const descriptions: Record<string,string> = {
  executive:'Your retirement, evidence and assurance priorities in one place.',
  operations:'Balance review work and resolve outstanding evidence.',
  finance:'Review payment findings and their supporting evidence.',
  forecast:'Plan preparation work from source-supplied retirement dates.',
  retirements:'Prepare the next retirement files before their milestone dates.',
  cases:'Investigate discrepancies and keep the supporting evidence together.',
  policies:'Find approved procedures and review proposed changes.',
  contributions:'Compare expected contributions with source-reported receipts.',
  'payment-exceptions':'Investigate payment differences before recording a review outcome.',
  'rule-designer':'Edit calculations and conditions in the GoRules visual designer.',
  copilot:'Ask about member evidence or published policies and inspect the cited answer.',
  'data-integrations':'Preview source changes, commit the import and follow its effects across the workspace.',
  'demo-center':'Walk through prepared scenarios and upload the supplied fictional PDF evidence.',
  roles:'Understand each role and hand work to an independent reviewer.',
};
export function screenCapability(id:string): Page {
  if (id==='access') return 'access';
  if (['roles','settings','screen-map','prototype-scope','demo-guide'].includes(id)) return 'roles';
  if(id==='demo-center') return 'demo';
  if(id==='background-jobs'||id==='replay'||id==='health'||id==='ai-settings') return 'jobs';
  if(id==='audit') return 'audit';
  if(['source-governance','conflicts','provenance'].includes(id)) return 'governance';
  if(['data-integrations','sync','publish','odoo'].includes(id)) return 'integrations';
  if(['connectors','connector-new','discovery','mapping','validation','impact'].includes(id)) return 'studio';
  if(id==='knowledge') return 'policy';
  const group=screens.find(s=>s.id===id)?.group || '';
  if(group==='Dashboard') return 'dashboard';
  if(group.startsWith('01')||group==='Shared · Analytics') return 'readiness';
  if(group.startsWith('02')) return ['cases','case','timeline','evidence'].includes(id)?'cases':'documents';
  if(group.startsWith('03')) return 'policy';
  if(group.startsWith('04')) return 'contribution';
  if(group.startsWith('05')) return 'payment';
  if(group==='Shared · AI & Member 360') return 'members';
  if(group==='Shared · Work & Reports') return 'cases';
  if(group==='Shared · Rules & Data Studio') return 'studio';
  return 'roles';
}
export function allowedScreen(id:string,role:Role,mode:'dev'|'oidc') {
  if(id==='approvals' && !['SUPER_ADMIN','ADMIN','REVIEWER'].includes(role)) return false;
  if(role==='AUDITOR' && ['copilot','questions','conversations','insight-center','rule-ai'].includes(id)) return false;
  return screens.some(s=>s.id===id) && canNavigate(role,screenCapability(id),mode);
}
const legacyAliases:Record<string,string>={dashboard:'executive',contribution:'contributions',payment:'payment-exceptions',studio:'studio-home',governance:'source-governance',jobs:'background-jobs',integrations:'data-integrations',demo:'demo-center'};
export function legacyTarget(target:string) {
  const [id,query]=target.split('?');
  return (id==='policy'?'policies':legacyAliases[id]||id)+(query?'?'+query:'');
}
/** Accept the earlier Node links without changing any original v6.2 route ID. */
export function normalizeTarget(target:string) {
  const clean=target.replace(/^\/?#?\/?/,'') || 'executive';
  const [id,query]=clean.split('?');
  return (legacyAliases[id]||id)+(query?'?'+query:'');
}
export function screenCopilot(id:string):CopilotPage|null {
  if(['forecast','population','comparison'].includes(id)) return 'forecast';
  if(id.startsWith('analytics-')) return 'dashboard';
  if(['copilot','questions','conversations'].includes(id)) return 'members';
  const capability=screenCapability(id);
  const mapping:Partial<Record<Page,CopilotPage>>={dashboard:'dashboard',members:'members',readiness:'readiness',documents:'documents',policy:'policy',contribution:'contributions',payment:'payments',cases:'cases',studio:'studio',governance:'governance'};
  return mapping[capability]||null;
}
export const studioPages = screens.filter(s=>s.group==='Shared · Rules & Data Studio').map(s=>s.id);
export function studioTab(page:string):'data'|'design'|'tests'|'review' {
  if(page==='rule-designer') return 'design';
  if(['rule-test','rule-impact'].includes(page)) return 'tests';
  if(page==='rule-versions') return 'review';
  return 'data';
}
