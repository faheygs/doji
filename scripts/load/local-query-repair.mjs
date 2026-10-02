import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root='test-results/local-query-repair-20260928';
const {db,container}=JSON.parse(readFileSync(`${root}/state.json`));
assert.match(db,/^heavy_load_qa_[0-9]+$/);assert.equal(container,'supabase_db_employee-cutover-verify');
const podman='C:/Program Files/RedHat/Podman/podman.exe';
const exec=(args,options={})=>execFileSync(podman,args,{encoding:'utf8',maxBuffer:30e6,timeout:60000,...options});
const info=JSON.parse(exec(['inspect',container]))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
const sql=input=>exec(['exec','-i',container,'psql','-X','-h','/var/run/postgresql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1'],{input});
assert.equal(sql("select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;").trim(),'0\n0');
const mode=process.argv[2];
const hashes=()=>JSON.parse(sql("select json_object_agg(p.oid::regprocedure::text,json_build_object('hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';"));
if(mode==='apply') {
 const before=hashes();writeFileSync(`${root}/before-functions.json`,JSON.stringify(before,null,2));
 const names=['sync_comment_mentions','get_notification_center_snapshot_without_post_context','get_notification_center_snapshot_without_moderation','get_notification_center_snapshot'];
 let originals='';let clones='';
 for(const name of names){
  let def=sql(`select pg_get_functiondef(oid) from pg_proc where pronamespace='public'::regnamespace and proname='${name}';`).trim();
  assert.ok(def.startsWith('CREATE OR REPLACE FUNCTION'));
  originals+=def+';\n';
  for(const n of [...names].sort((a,b)=>b.length-a.length))def=def.replaceAll(`public.${n}(`,`local_load.baseline_${n}(`);
  clones+=def+';\n';
 }
 writeFileSync(`${root}/rollback-functions.sql`,'begin;\n'+originals+'commit;\n');
 sql(clones); // local_load exists only in the offline fixture, never production.
 sql(readFileSync('docs/drafts/member_query_performance_indexes_v1.sql','utf8'));
 sql(readFileSync('docs/drafts/member_query_performance_v1.sql','utf8'));
 sql('analyze public.comments;analyze public.reactions;');
 const after=hashes();const changed=Object.keys(before).filter(k=>before[k].hash!==after[k]?.hash);
 assert.deepEqual(changed.sort(),['get_notification_center_snapshot_without_post_context(timestamp with time zone,integer)','sync_comment_mentions(uuid,text,uuid)'].sort());
 assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
 for(const k of Object.keys(before))assert.equal(after[k].acl,before[k].acl,`ACL changed: ${k}`);
 writeFileSync(`${root}/candidate-functions.json`,JSON.stringify({compared:Object.keys(before).length,changed,allAclsPreserved:true},null,2));
 console.log('Candidate applied to isolated fixture; exactly two function bodies changed, all ACLs preserved.');
} else if(mode==='verify-rollback') {
 const candidate=hashes();const baseline=JSON.parse(readFileSync(`${root}/before-functions.json`));
 let rollback='begin;\nset local lock_timeout=\'3s\';\n';
 for(const name of ['sync_comment_mentions','get_notification_center_snapshot_without_post_context']) {
  const def=sql(`select pg_get_functiondef(oid) from pg_proc where pronamespace='local_load'::regnamespace and proname='baseline_${name}';`).trim();
  assert.ok(def.startsWith('CREATE OR REPLACE FUNCTION'));
  rollback+=def.replaceAll(`local_load.baseline_${name}(`,`public.${name}(`)+';\n';
 }
 rollback+='commit;\n';writeFileSync(`${root}/rollback-two-functions.sql`,rollback);
 sql(rollback);assert.deepEqual(hashes(),baseline,'Rollback must restore every captured definition/ACL');
 sql(readFileSync('docs/drafts/member_query_performance_v1.sql','utf8'));
 assert.deepEqual(hashes(),candidate,'Reapply must restore exact tested candidate');
 writeFileSync(`${root}/rollback-verification.json`,JSON.stringify({at:new Date().toISOString(),restoredFunctions:Object.keys(baseline).length,exactRollback:true,exactReapply:true}));
 console.log('Exact 331-function rollback and guarded reapply passed.');
} else if(mode==='parity'||mode==='mention-bound'||mode==='validate-fixture') {
 const file=mode==='validate-fixture'?'local-heavy-validate-fixture.sql':`local-query-${mode}.sql`;
 const out=sql(readFileSync(`scripts/load/${file}`,'utf8'));
 writeFileSync(`${root}/${mode}.txt`,out);console.log(out);
} else throw new Error('Expected apply, parity, mention-bound, validate-fixture or verify-rollback');
