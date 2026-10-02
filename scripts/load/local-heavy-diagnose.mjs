import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root='test-results/local-query-repair-20260928';
const {db,container}=JSON.parse(readFileSync(`${root}/state.json`));
assert.match(db,/^heavy_load_qa_[0-9]+$/);assert.equal(container,'supabase_db_employee-cutover-verify');
const podman='C:/Program Files/RedHat/Podman/podman.exe';
const info=JSON.parse(execFileSync(podman,['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');
const run=input=>spawnSync(podman,['exec','-i',container,'psql','-X','-h','/var/run/postgresql','-U','supabase_admin','-d',db,'-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:60000,maxBuffer:30e6});
const guard=run("select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;");assert.equal(guard.stdout.trim(),'0\n0');
for(const [name,query] of Object.entries({
 notifications:"select jsonb_array_length(public.get_notification_center_snapshot(now()-interval '30 days',200));",
 comment:"select public.submit_comment(local_load.id(99999,'a6'),'Synthetic plan probe',null,'load-plan-probe-comment');",
 comment_mention:"select public.submit_comment(local_load.id(99999,'a6'),'Synthetic plan @load_v55556',null,'load-plan-probe-mention');",
})) {
 const result=run(`begin;set local statement_timeout='30s';load 'auto_explain';set local client_min_messages='log';set local auto_explain.log_min_duration=0;set local auto_explain.log_analyze=on;set local auto_explain.log_buffers=on;set local auto_explain.log_nested_statements=on;set local auto_explain.log_timing=off;select set_config('request.jwt.claims',json_build_object('sub',local_load.id(55555),'role','authenticated')::text,true);set local role authenticated;${query}rollback;`);
 writeFileSync(`${root}/plan-${name}.txt`,result.stdout+'\n'+result.stderr);assert.equal(result.status,0,result.stderr.slice(-1500));
 console.log(name,'plan captured',result.stderr.length,'bytes');
}
const validation=run(`begin;select set_config('request.jwt.claims',json_build_object('sub',local_load.id(55555),'role','authenticated')::text,true);set local role authenticated;select json_build_object('feed_count',jsonb_array_length(public.get_feed_page_snapshot_v2(local_load.id(1,'a3'),'everyone',20,null,null)),'friends_count',jsonb_array_length(public.get_feed_page_snapshot_v2(local_load.id(1,'a3'),'friends',20,null,null)),'notifications_count',jsonb_array_length(public.get_notification_center_snapshot(now()-interval '2 days',20)));rollback;`);
assert.equal(validation.status,0);writeFileSync(`${root}/nonempty-read-validation.txt`,validation.stdout);console.log(validation.stdout);
