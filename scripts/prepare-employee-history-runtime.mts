// Local-only backport: preserve the captured deployed service + approved timestamp fix.
import assert from 'node:assert/strict';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { inventory } from './prepare-safety-launch.mts';
const root = 'test-results/employee-history-integration-20261009-v2';
const base = 'test-results/employee-health-timestamp-20261009/candidate';
const runtime = 'supabase/functions/employee-portal-v2/runtime/';
const read = (path: string) =>
  readFile(path, 'utf8').then((value) => value.replaceAll('\r\n', '\n'));
const replace = (source: string, before: string, after: string) => {
  assert.equal(source.split(before).length, 2, 'Baseline drift: ' + before);
  return source.replace(before, after);
};
const compile = (source: string, name: string) =>
  ts.transpileModule(source, {
    fileName: name,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      rewriteRelativeImportExtensions: true,
    },
  }).outputText;
assert.equal(process.argv.length, 2, 'No deploy mode accepted');
await assert.rejects(access(root));
const prior = JSON.parse(
  await read('test-results/employee-health-timestamp-20261009/prepared.json'),
) as { after: Record<string, string> };
const baseline = await inventory(base);
assert.deepEqual(Object.fromEntries(baseline.map((a) => [a.path, a.sha256])), prior.after);
let adapter = await read(base + '/' + runtime + 'employee-application-adapter.mjs');
adapter =
  'import { employeeHistoryContracts, employeeHistorySql } from "./employee-history-contracts.mjs";\n' +
  adapter;
adapter = replace(
  adapter,
  '    const announcementComposeEnabled = options.announcementComposeEnabled === true;',
  '    const announcementComposeEnabled = options.announcementComposeEnabled === true;\n    const historyReadsEnabled = options.historyReadsEnabled === true;',
);
adapter = replace(
  adapter,
  "        const compose = input?.name === 'admin_announcement_compose_v1';",
  "        const compose = input?.name === 'admin_announcement_compose_v1';\n        const history = !!input && Object.hasOwn(employeeHistoryContracts, input.name);",
);
adapter = replace(
  adapter,
  '(compose ? !announcementComposeEnabled : !Object.hasOwn(employeeOperations, input.name))',
  '(history ? !historyReadsEnabled : compose ? !announcementComposeEnabled : !Object.hasOwn(employeeOperations, input.name))',
);
adapter = replace(
  adapter,
  'const contract = compose ? employeeAnnouncementContract : contracts[input.name];',
  'const contract = history ? employeeHistoryContracts[input.name] : compose ? employeeAnnouncementContract : contracts[input.name];',
);
adapter = replace(
  adapter,
  '        const args = { ...contract.defaults, ...supplied };',
  '        const args = { ...contract.defaults, ...supplied };\n        if (history && (!Number.isInteger(args.p_limit) || Number(args.p_limit) < 1 || Number(args.p_limit) > 25)) throw fail(400);',
);
adapter = replace(
  adapter,
  "return await execute('doji_employee_application', compose ?",
  "return await execute('doji_employee_application', history ? employeeHistorySql : compose ?",
);
let sql = await read(base + '/' + runtime + 'restricted-sql.mjs');
sql = 'import { employeeHistorySql } from "./employee-history-contracts.mjs";\n' + sql;
sql = replace(
  sql,
  '[employeeWorkflowSql]: 7,',
  '[employeeWorkflowSql]: 7,\n            [employeeHistorySql]: 7,',
);
let entryRuntime = await read(base + '/' + runtime + 'employee-runtime.mjs');
entryRuntime = replace(
  entryRuntime,
  '{ announcementComposeEnabled: policy.announcementComposeEnabled === true }',
  '{ announcementComposeEnabled: policy.announcementComposeEnabled === true, historyReadsEnabled: policy.historyReadsEnabled === true }',
);
const changed = new Map([
  ['employee-application-adapter.mjs', adapter],
  ['restricted-sql.mjs', sql],
  ['employee-runtime.mjs', entryRuntime],
  [
    'employee-history-contracts.mjs',
    compile(
      await read('infra/portal-identity/employee-history-contracts.mts'),
      'employee-history-contracts.mts',
    ),
  ],
]);
await mkdir(root);
for (const enabled of [false, true]) {
  const dir = root + (enabled ? '/employee-on' : '/employee-off');
  await cp(base, dir, { recursive: true, force: false, errorOnExist: true });
  for (const [name, source] of changed) await writeFile(dir + '/' + runtime + name, source);
  const entry = 'supabase/functions/employee-portal-v2/index.ts';
  await writeFile(
    dir + '/' + entry,
    replace(
      await read(base + '/' + entry),
      'announcementComposeEnabled: true,',
      'announcementComposeEnabled: true,\n          historyReadsEnabled: ' + enabled + ',',
    ),
  );
  const assets = await inventory(dir);
  for (const asset of baseline)
    if (!changed.has(asset.path.replace(runtime, '')) && asset.path !== entry)
      assert.equal(
        assets.find((a) => a.path === asset.path)?.sha256,
        asset.sha256,
        'Unrelated runtime changed: ' + asset.path,
      );
  await writeFile(
    dir + '.json',
    JSON.stringify(
      {
        assets,
        historyReadsEnabled: enabled,
        productionChanged: false,
        changed: [...changed.keys(), entry],
      },
      null,
      2,
    ),
  );
}
const tests = [
  'test-employee-history-adapter',
  'test-employee-announcement-adapter',
  'test-employee-application-adapter',
  'test-employee-browser-transport',
  'test-employee-runtime-boundaries',
  'test-restricted-portal-sql',
  'test-employee-health',
];
await mkdir(root + '/tests');
for (const name of tests) {
  let source = compile(await read('scripts/' + name + '.mts'), name + '.mts');
  source = source
    .replace(
      /(['"])\.\.\/infra\/portal-identity\/([^'"]+)\1/g,
      (_, quote: string, file: string) => {
        const suffix = file.replace(/\.mts$/, '.mjs');
        return baseline.some((a) => a.path === runtime + suffix) || changed.has(suffix)
          ? quote + '../employee-off/' + runtime + suffix + quote
          : quote +
              '../../../infra/portal-identity/' +
              file.replace(/\.mjs$/, '.mts') +
              quote;
      },
    )
    .replace(
      /(['"])\.\/([^'"]+)\1/g,
      (_, quote: string, file: string) =>
        quote + '../../../scripts/' + file.replace(/\.mjs$/, '.mts') + quote,
    );
  await writeFile(root + '/tests/' + name + '.mjs', source);
}
execFileSync(
  process.execPath,
  ['--test', ...tests.map((name) => root + '/tests/' + name + '.mjs')],
  { stdio: 'inherit', timeout: 60000 },
);
await writeFile(
  root + '/tested.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      tests,
      productionChanged: false,
      off: await inventory(root + '/employee-off'),
      on: await inventory(root + '/employee-on'),
      rollback: 'test-results/employee-health-timestamp-20261009/rollback',
    },
    null,
    2,
  ),
);
console.log(
  'Exact scoped history runtime passes regression tests; both gates packaged, nothing deployed.',
);
