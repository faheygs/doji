// Read-only live preflight. No production modification or secret output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { evidenceRecord, firstEvidence, releaseBaseline } from './release-evidence.mts';
assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), 'tvixsmqxotuvyjqzmjla');
const root = 'test-results/member-query-release-20260928';
mkdirSync(root, { recursive: true });
const out = execFileSync(
  process.execPath,
  [
    'node_modules/supabase/dist/supabase.js',
    'db',
    'query',
    '--linked',
    '--output-format',
    'json',
    '--file',
    'scripts/member-query-release-preflight.sql',
  ],
  { encoding: 'utf8', timeout: 30000, maxBuffer: 5e6 },
);
const b = releaseBaseline(firstEvidence(JSON.parse(out.slice(out.indexOf('{'))), 'baseline'));
const label = process.argv[2] ?? 'before';
assert.match(label, /^[a-z0-9-]+$/);
writeFileSync(`${root}/database-${label}.json`, JSON.stringify(b, null, 2), { flag: 'wx' });
const reference = evidenceRecord(
  JSON.parse(readFileSync('test-results/performance-repair-20260928/database-after.json', 'utf8')),
);
for (const k of [
  'functions',
  'policies',
  'relations',
  'triggers',
  'role_settings',
  'indexes',
  'default_acl',
])
  assert.deepEqual(b[k], reference[k], `Unexpected live drift: ${k}`);
console.log(
  JSON.stringify({
    at: b.at,
    functions: Object.keys(b.functions).length,
    tables: b.tables,
    databaseBytes: b.database_bytes,
    next: b.next_event,
    active: b.active_events,
    overdue: b.overdue_outbox,
    locks: b.lock_waits,
    baselineMatches: true,
  }),
);
