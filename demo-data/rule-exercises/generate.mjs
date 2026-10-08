// Rebuild distributable example payloads from the same catalog the application executes.
// From project root: node --import tsx demo-data/rule-exercises/generate.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ruleExercises, exerciseFixture } from '../../apps/api/src/rule-exercises.ts';
const dir = path.dirname(fileURLToPath(import.meta.url));
const catalog = ruleExercises();
await mkdir(path.join(dir, 'models'), { recursive: true });
await writeFile(path.join(dir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const fixtures = [];
const rows = [['exerciseId','module','scenarioId','name','memberId','assessmentDate','expectedStatus','expectedOutput','expectedIssueCodes','sourcePath','sourceKind','explanation']];
for (const exercise of catalog) {
  await writeFile(path.join(dir,'models',`${exercise.id}.json`),JSON.stringify(exercise.config,null,2)+'\n');
  for (const s of exercise.scenarios) {
    rows.push([exercise.id,exercise.config.module,s.id,s.name,s.memberId,s.assessmentDate,s.expectedStatus,JSON.stringify(s.expectedOutput??{}),(s.expectedIssueCodes??[]).join('|'),exercise.config.source.path,exercise.sourceKind,s.explanation]);
    const fixture=exerciseFixture(exercise.id,s.memberId);
    if(fixture) fixtures.push({exerciseId:exercise.id,scenarioId:s.id,method:'GET',path:`/demo-source/exercises/${exercise.id}/${s.memberId}`,...fixture});
  }
}
await writeFile(path.join(dir,'api-fixtures.json'),JSON.stringify(fixtures,null,2)+'\n');
await writeFile(path.join(dir,'expected-results.csv'),rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
console.log(`Wrote ${catalog.length} model payloads, ${rows.length-1} scenarios and ${fixtures.length} isolated HTTP fixtures.`);
