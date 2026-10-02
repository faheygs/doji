import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const phase = process.argv[2];
assert.ok(['before','after'].includes(phase));
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),'tvixsmqxotuvyjqzmjla');
const out = execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js','db','query','--linked',
  '--output-format','json','--file','scripts/push-registration-baseline.sql'], {encoding:'utf8',timeout:30_000});
const result = JSON.parse(out.slice(out.indexOf('{'))).rows[0].baseline;
const root = 'test-results/push-registration-release-20260926';
mkdirSync(root,{recursive:true});
if (phase==='before') assert.ok(!existsSync(`${root}/before.json`), 'Never overwrite the release rollback baseline');
writeFileSync(`${root}/${phase}.json`, JSON.stringify(result,null,2));
console.log(JSON.stringify({phase,version:result.server_version,functions:Object.keys(result.functions).length,
  target:result.functions['register_push_token(text)'],activeEvents:result.active_event_count,
  window:result.window,overdueOutbox:result.overdue_outbox,lockWaits:result.client_lock_waits}));
