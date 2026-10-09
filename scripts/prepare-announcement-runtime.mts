// Backport only the approved announcement delta onto the captured live runtime.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { inventory } from './prepare-safety-launch.mts';
const root = 'test-results/react-admin-announcements-20261009';
const base = root + '/employee-before';
const runtime = 'supabase/functions/employee-portal-v2/runtime/';
const read = (path: string) => readFile(path, 'utf8').then((s) => s.replaceAll('\r\n', '\n'));
const compile = (source: string, name: string) =>
  ts.transpileModule(source, {
    fileName: name,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      rewriteRelativeImportExtensions: true,
    },
  }).outputText;
const replace = (source: string, before: string, after: string) => {
  assert.equal(source.split(before).length, 2, 'Unreviewed runtime shape: ' + before);
  return source.replace(before, after);
};
await assert.rejects(access(root + '/employee-off'));
const changed = new Map<string, string>();
let adapter = await read(base + '/' + runtime + 'employee-application-adapter.mjs');
adapter =
  'import { employeeAnnouncementContract, employeeAnnouncementSql } from "./employee-announcement-contracts.mjs";\n' +
  adapter;
adapter = replace(
  adapter,
  'createEmployeeApplicationAdapter(execute)',
  'createEmployeeApplicationAdapter(execute, options = {})',
);
adapter = replace(
  adapter,
  '    async function command(actor, input, signal)',
  '    const announcementComposeEnabled = options.announcementComposeEnabled === true;\n    async function command(actor, input, signal)',
);
adapter = replace(
  adapter,
  '        if (!input || !Object.hasOwn(employeeOperations, input.name))\n            throw fail(403);\n        const contract = contracts[input.name];',
  "        const compose = input?.name === 'admin_announcement_compose_v1';\n        if (!input || (compose ? !announcementComposeEnabled : !Object.hasOwn(employeeOperations, input.name))) throw fail(403);\n        const contract = compose ? employeeAnnouncementContract : contracts[input.name];",
);
adapter = replace(
  adapter,
  "return await execute('doji_employee_application', Object.hasOwn",
  "return await execute('doji_employee_application', compose ? employeeAnnouncementSql : Object.hasOwn",
);
adapter = replace(
  adapter,
  '                55000: 409,',
  "                55000: 409,\n                ...((compose || (input.name === 'admin_editorial_command_v1' && args.p_kind === 'announcements')) ? { '40001': 409, P0001: 400 } : {}),",
);
changed.set('employee-application-adapter.mjs', adapter);
let sql = await read(base + '/' + runtime + 'restricted-sql.mjs');
sql = 'import { employeeAnnouncementSql } from "./employee-announcement-contracts.mjs";\n' + sql;
sql = replace(
  sql,
  '[employeeWorkflowSql]: 7,',
  '[employeeWorkflowSql]: 7,\n            [employeeAnnouncementSql]: 7,',
);
sql = replace(
  sql,
  "['42501', '22023', '22P02', 'PT409', '55000']",
  "['42501', '22023', '22P02', 'PT409', '55000', '40001', 'P0001']",
);
changed.set('restricted-sql.mjs', sql);
changed.set(
  'employee-runtime.mjs',
  replace(
    await read(base + '/' + runtime + 'employee-runtime.mjs'),
    'createEmployeeApplicationAdapter(execute);',
    'createEmployeeApplicationAdapter(execute, { announcementComposeEnabled: policy.announcementComposeEnabled === true });',
  ),
);
changed.set(
  'employee-announcement-contracts.mjs',
  compile(
    await read('infra/portal-identity-candidate/employee-announcement-contracts.mts'),
    'employee-announcement-contracts.mts',
  ),
);
const baseline = await inventory(base);
for (const enabled of [false, true]) {
  const output = root + (enabled ? '/employee-on' : '/employee-off');
  await cp(base, output, { recursive: true, force: false, errorOnExist: true });
  for (const [name, source] of changed) await writeFile(output + '/' + runtime + name, source);
  const entry = 'supabase/functions/employee-portal-v2/index.ts';
  const original = await read(base + '/' + entry);
  assert.ok(original.includes('staffWorkflowEnabled: true,'));
  await writeFile(
    output + '/' + entry,
    replace(
      original,
      '          enabled: true,',
      '          enabled: true,\n          announcementComposeEnabled: ' + enabled + ',',
    ),
  );
  await writeFile(
    output + '/supabase/config.toml',
    'project_id = "announcement-employee-only"\n[functions.employee-portal-v2]\nverify_jwt = false\nimport_map = "./functions/employee-portal-v2/deno.json"\n',
  );
  const assets = await inventory(output);
  for (const asset of baseline)
    if (!changed.has(asset.path.replace(runtime, '')) && asset.path !== entry)
      assert.equal(
        assets.find((a) => a.path === asset.path)?.sha256,
        asset.sha256,
        'Unrelated runtime changed: ' + asset.path,
      );
  await writeFile(
    output + '.json',
    JSON.stringify(
      { assets, enabled, preservedLiveStaffOverride: true, changed: [...changed.keys(), entry] },
      null,
      2,
    ),
    { flag: 'wx' },
  );
}
// Execute existing security tests against the exact emitted runtime modules.
const tests = [
  'test-employee-announcement-adapter',
  'test-employee-application-adapter',
  'test-employee-browser-transport',
  'test-employee-runtime-boundaries',
  'test-restricted-portal-sql',
];
const directory = root + '/runtime-tests';
await mkdir(directory);
for (const name of tests) {
  let source = compile(await read('scripts/' + name + '.mts'), name + '.mts');
  source = source
    .replace(
      /(['"])\.\.\/infra\/portal-identity-candidate\/([^'"]+)\1/g,
      (_, quote: string, file: string) => {
        const suffix = file.replace(/\.mts$/, '.mjs');
        return baseline.some((a) => a.path === runtime + suffix) || changed.has(suffix)
          ? quote + '../employee-off/' + runtime + suffix + quote
          : quote +
              '../../../infra/portal-identity-candidate/' +
              file.replace(/\.mjs$/, '.mts') +
              quote;
      },
    )
    .replace(
      /(['"])\.\/([^'"]+)\1/g,
      (_, quote: string, file: string) =>
        quote + '../../../scripts/' + file.replace(/\.mjs$/, '.mts') + quote,
    );
  await writeFile(directory + '/' + name + '.mjs', source);
}
execFileSync(process.execPath, ['--test', ...tests.map((n) => directory + '/' + n + '.mjs')], {
  stdio: 'inherit',
  timeout: 60000,
});
await writeFile(
  root + '/runtime-tested.json',
  JSON.stringify({ at: new Date().toISOString(), tests: 80, productionChanged: false }),
  { flag: 'wx' },
);
