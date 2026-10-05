// Generate an isolated, reversible release; never applies unrelated migrations.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = 'test-results/push-registration-release-20260926';
const baseline: unknown = JSON.parse(readFileSync(`${root}/before.json`, 'utf8'));
assert.ok(
  baseline &&
    typeof baseline === 'object' &&
    'functions' in baseline &&
    'push_definition' in baseline,
);
assert.ok(
  baseline.functions &&
    typeof baseline.functions === 'object' &&
    'register_push_token(text)' in baseline.functions,
);
const prior = baseline.functions['register_push_token(text)'];
assert.ok(prior && typeof prior === 'object' && 'hash' in prior);
assert.equal(typeof baseline.push_definition, 'string');
const oldHash = '9643647407ac75f82729df0fe1e1fcb5';
const newHash = '1dc8db0962651d38f4920d6968f224a3';
assert.equal(prior.hash, oldHash);
const migration = readFileSync(
  'supabase/migrations/20260926050000_skip_unchanged_push_profile_update.sql',
  'utf8',
);
const snapshotPart = readFileSync('scripts/push-registration-baseline.sql', 'utf8').split(
  "set local statement_timeout = '5s';",
)[1];
assert.ok(snapshotPart, 'Missing bounded baseline SQL marker');
const snapshot = snapshotPart.replace(/commit;\s*$/, '').trim();
const begin = "begin;\nset local statement_timeout='15s';\nset local lock_timeout='2s';\n";
const capture = `create temporary table push_release_before on commit drop as ${snapshot}\n`;
const preflight = `do $gate$ declare b jsonb; begin
 select baseline into b from push_release_before;
 if (b->>'active_event_count')::int<>0 or (b->>'overdue_outbox')::int<>0 or (b->>'client_lock_waits')::int<>0
   or (b->'window'->>'next')::timestamptz < clock_timestamp()+interval '25 minutes' then
   raise exception 'Unsafe live deployment window';
 end if;
end $gate$;\n`;
const checks = (
  hash: string,
) => `create temporary table push_release_after on commit drop as ${snapshot}
do $verify$ declare b jsonb; a jsonb; k text; begin
 select baseline into b from push_release_before; select baseline into a from push_release_after;
 if a->'functions'->'register_push_token(text)'->>'hash'<>'${hash}' then raise exception 'Unexpected candidate definition'; end if;
 if ((a->'functions')-'register_push_token(text)') is distinct from ((b->'functions')-'register_push_token(text)')
 or ((a->'functions'->'register_push_token(text)')-'hash') is distinct from ((b->'functions'->'register_push_token(text)')-'hash')
 then raise exception 'Function or grant drift'; end if;
 foreach k in array array['policies','relations','triggers','role_settings'] loop
   if a->k is distinct from b->k then raise exception 'Unexpected contract drift: %',k; end if;
 end loop;
end $verify$;\n`;
const ledger = `insert into supabase_migrations.schema_migrations(version,name,statements)
values('20260926050000','skip_unchanged_push_profile_update',array[$migration$${migration}$migration$]);\n`;
const body = capture + migration + '\n' + checks(newHash) + ledger;
writeFileSync(
  `${root}/deploy.sql`,
  begin + capture + preflight + migration + '\n' + checks(newHash) + ledger + 'commit;\n',
);
writeFileSync(`${root}/local-deploy-rehearsal.sql`, begin + body + 'rollback;\n');
const rollbackGuard = `do $$ begin if md5(pg_get_functiondef('public.register_push_token(text)'::regprocedure))<>'${newHash}' then raise exception 'Rollback baseline drift'; end if; end $$;\n`;
writeFileSync(
  `${root}/rollback.sql`,
  begin +
    capture +
    rollbackGuard +
    baseline.push_definition +
    ';\n' +
    checks(oldHash) +
    "delete from supabase_migrations.schema_migrations where version='20260926050000' and name='skip_unchanged_push_profile_update';\ncommit;\n",
);
writeFileSync(
  `${root}/local-roundtrip.sql`,
  begin + body + 'commit;\n' + readFileSync(`${root}/rollback.sql`, 'utf8'),
);
console.log('Prepared guarded deploy, rollback, transactional rehearsal and local roundtrip SQL.');
