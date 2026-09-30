import { describe,expect,it } from 'vitest';
import { allowedScreen,legacyTarget,normalizeTarget,screenCopilot,studioTab } from './navigation';
describe('Original navigation capability boundaries',()=>{
  it('preserves actionable payment controls while hiding unauthorized review and administration',()=>{
    expect(allowedScreen('controls','OFFICER','dev')).toBe(true);
    expect(allowedScreen('approvals','OFFICER','dev')).toBe(false);
    expect(allowedScreen('approvals','AUDITOR','dev')).toBe(false);
    expect(allowedScreen('approvals','REVIEWER','oidc')).toBe(true);
    expect(allowedScreen('access','ADMIN','dev')).toBe(false);
    expect(allowedScreen('access','SUPER_ADMIN','oidc')).toBe(true);
  });
  it('keeps demonstration switching and generated AI routes out of inappropriate sessions',()=>{
    expect(allowedScreen('demo-center','SUPER_ADMIN','oidc')).toBe(false);
    expect(allowedScreen('demo-center','SUPER_ADMIN','dev')).toBe(true);
    for(const page of ['copilot','questions','conversations','rule-ai'])expect(allowedScreen(page,'AUDITOR','dev')).toBe(false);
    expect(allowedScreen('rule-designer','OFFICER','dev')).toBe(false);
    expect(allowedScreen('rule-designer','DESIGNER','oidc')).toBe(true);
    expect(allowedScreen('unknown','SUPER_ADMIN','dev')).toBe(false);
  });
  it('keeps member selections and original detail IDs when resolving earlier Node links',()=>{
    expect(legacyTarget('payment?m=M005')).toBe('payment-exceptions?m=M005');
    expect(normalizeTarget('policy?p=p1')).toBe('policy?p=p1');
    expect(normalizeTarget('integrations')).toBe('data-integrations');
    expect(studioTab('rule-designer')).toBe('design');
    expect(studioTab('rule-versions')).toBe('review');
    expect(screenCopilot('payment-detail')).toBe('payments');
    expect(screenCopilot('forecast')).toBe('forecast');
    expect(screenCopilot('analytics-capacity')).toBe('dashboard');
  });
});
