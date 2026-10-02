// Offline, synthetic, rollback-only integration against the existing full schema.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import { engine as podman, container } from './database/owned-target.mjs';
const info=JSON.parse(execFileSync(podman,['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
const drafts=['external_takedown_intake_v1.sql','moderation_media_ledger_v1.sql','moderation_media_restoration_v1.sql','moderation_media_cleanup_v1.sql','moderation_media_evidence_v1.sql','moderation_media_closure_v1.sql','moderation_media_wakeup_v1.sql'].map(n=>
 readFileSync(`docs/drafts/${n}`,'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')).join('\n');
const bridge=readFileSync('scripts/test-safety-removal-bridge.sql','utf8');
const fixture=bridge.slice(bridge.indexOf('do $$declare author'),bridge.indexOf('end$$;')+'end$$;'.length);
assert.ok(fixture.startsWith('do $$declare author')&&fixture.endsWith('end$$;'));
const checks=readFileSync('scripts/test-moderation-media-restoration.sql','utf8');
const sql=`begin;
do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic offline database required'; end if; end$$;
create temp table prior_functions as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
${drafts}
${fixture}
${checks}
${readFileSync('scripts/test-moderation-media-cleanup.sql','utf8')}
${readFileSync('scripts/test-moderation-media-evidence.sql','utf8')}
reset role;
select pg_temp.check_true(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid where (f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl) and p.oid not in('public.enforce_owned_profile_avatar()'::regprocedure,'public.get_admin_report_case_v3(uuid)'::regprocedure,'public.get_admin_appeal_case_v1(uuid)'::regprocedure)),'only scoped avatar ownership guard and employee evidence readers changed');
do $$declare backup record; begin
 for backup in select * from public.moderation_media_integration_rollback loop
  if md5(pg_get_functiondef(backup.signature::regprocedure))<>backup.installed_hash then raise exception 'Rollback definition changed'; end if;
  execute backup.original_definition;
 end loop;
end$$;
select pg_temp.check_true(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'guarded definition rollback restores prior functions and grants');
select count(*)||' database assertions passed' from pg_temp.media_test_assertions;
rollback;`;
try{const output=execFileSync(podman,['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8000000});
 console.log('Offline media decision/appeal restoration integration passed; all fixture changes rolled back.');
 console.log(output.trim().split('\n').slice(-2).join('\n'));
}catch(error){console.error(error.stderr?.toString()||error.message);process.exitCode=1;}
