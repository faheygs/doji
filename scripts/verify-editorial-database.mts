import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import {
  evidenceRecord,
  evidenceStrings,
  firstEvidence,
  releaseBaseline,
} from './release-evidence.mts';
const root = 'test-results/portal-editorial-release-20260927';
assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), 'tvixsmqxotuvyjqzmjla');
const query = (file: string, key: string) => {
  const raw = execFileSync(
    process.execPath,
    [
      'node_modules/supabase/dist/supabase.js',
      'db',
      'query',
      '--linked',
      '--output-format',
      'json',
      '--file',
      file,
    ],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 2e6 },
  );
  return firstEvidence(JSON.parse(raw.slice(raw.indexOf('{'))), key);
};
const before = releaseBaseline(JSON.parse(await readFile(`${root}/database-before.json`, 'utf8')));
const after = releaseBaseline(query('scripts/portal-editorial-preflight.sql', 'baseline'));
const contract = evidenceRecord(
  JSON.parse(await readFile(`${root}/database-contract.json`, 'utf8')),
);
const names = evidenceStrings(contract.names),
  tables = evidenceStrings(contract.tables),
  indexes = evidenceStrings(contract.indexes);
const omit = (v: unknown, keys: string[]) =>
  Object.fromEntries(Object.entries(evidenceRecord(v)).filter(([k]) => !keys.includes(k)));
assert.equal(after.migration_exists, true);
assert.deepEqual(omit(after.functions, names), before.functions);
assert.equal(Object.keys(after.functions).length, Object.keys(before.functions).length + 5);
for (const key of ['policies', 'triggers', 'role_settings', 'default_acl'])
  assert.deepEqual(after[key], before[key], key);
assert.deepEqual(omit(after.relations, tables), before.relations);
assert.deepEqual(omit(after.indexes, indexes), before.indexes);
const checks = query('scripts/portal-triage-member-canary.sql', 'checks');
await writeFile(`${root}/database-after.json`, JSON.stringify(after, null, 2), { flag: 'wx' });
const undo = await readFile(`${root}/rollback-body.sql`, 'utf8');
const guards = names
  .map((n) => {
    const definition = after.functions[n];
    assert.ok(definition && typeof definition.hash === 'string');
    return `if md5(pg_get_functiondef('public.${n}'::regprocedure))<>'${definition.hash}' then raise exception 'Rollback function drift: ${n}';end if;`;
  })
  .join('\n');
// Keep migration ledger: retained metadata/indexes mean initial CREATE must not be rerun.
await writeFile(
  `${root}/rollback.sql`,
  "-- Disable frontend, restore Worker, drain calls first. Retain all real content/history and migration ledger.\nbegin;\nset local statement_timeout='8s';set local lock_timeout='2s';\ndo $$begin\n" +
    guards +
    '\nend$$;\n' +
    undo +
    "\nnotify pgrst,'reload schema';\ncommit;\n",
  { flag: 'wx' },
);
const record = {
  verifiedAt: new Date().toISOString(),
  existingFunctionsAndGrantsPreserved: Object.keys(before.functions).length,
  allMemberPoliciesRelationsTriggersSettingsPreserved: true,
  checks,
  activeEvents: after.active_events,
  overdueOutbox: after.overdue_outbox,
  lockWaits: after.lock_waits,
};
await writeFile(`${root}/database-verified.json`, JSON.stringify(record, null, 2), { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
