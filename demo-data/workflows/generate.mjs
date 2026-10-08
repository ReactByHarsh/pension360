import { writeFile } from 'node:fs/promises';
import { demoWorkflowDefinitions } from '../../apps/api/dist/workflow-seed.js';
import { parseWorkflow } from '../../apps/api/dist/workflow-bpmn.js';

// Generates portable files only. Does not call seedWorkflows, access a database,
// load environment credentials, publish definitions, or start workflow instances.
const names = { readiness: 'retirement-readiness-review', payment: 'payment-exception-review' };
for (const fixture of demoWorkflowDefinitions()) {
  const basename = names[fixture.module];
  if (!basename) throw new Error(`Unexpected fixture module: ${fixture.module}`);
  const config = { name: fixture.name, module: fixture.module, xml: fixture.xml, bindings: fixture.bindings };
  if (Object.values(config.bindings).some(binding => binding.ruleId)) {
    throw new Error('Portable drafts must not contain database-specific rule IDs');
  }
  await parseWorkflow(config.xml, config.bindings, false);
  await writeFile(new URL(`${basename}.bpmn`, import.meta.url), config.xml + '\n');
  await writeFile(new URL(`${basename}.workflow.json`, import.meta.url), JSON.stringify(config, null, 2) + '\n');
  console.log(`Generated ${basename}.bpmn and ${basename}.workflow.json`);
}
