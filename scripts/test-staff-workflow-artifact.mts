// Re-run existing synthetic regressions against the actual selectively assembled runtime.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const root = 'test-results/staff-workflow-release',
  output = `${root}/artifact-tests`;
assert.ok(
  process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--role-fixed'),
);
const edgeDir = process.argv[2] === '--role-fixed' ? 'edge-role-fixed' : 'edge-after';
await mkdir(output, { recursive: true });
const names = [
  'test-employee-workflow-adapter',
  'test-employee-application-adapter',
  'test-restricted-portal-sql',
  'test-employee-runtime-boundaries',
  'test-employee-resources',
];
const files = [];
for (const name of names) {
  let source = ts.transpileModule(await readFile(`scripts/${name}.mts`, 'utf8'), {
    fileName: `${name}.mts`,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const m of [...source.matchAll(/from ['"](\.[^'"]+)['"]/g)]) {
    const spec = m[1];
    assert.ok(spec);
    const deployed = resolve(
      `${root}/${edgeDir}/supabase/functions/employee-portal-v2/runtime/${basename(spec).replace(/\.mts$/, '.mjs')}`,
    );
    const fallback = resolve('scripts', spec);
    const exists = await access(deployed).then(
      () => true,
      () => false,
    );
    const target =
      exists && spec.startsWith('../infra/portal-identity-candidate/') ? deployed : fallback;
    source = source.replaceAll(spec, pathToFileURL(target).href);
  }
  const path = `${output}/${name}.mjs`;
  await writeFile(path, source);
  files.push(path);
}
execFileSync(process.execPath, ['--test', ...files], { stdio: 'inherit', timeout: 60000 });
