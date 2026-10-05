// Explicit, bounded, separately approved database release. Never pushes other migrations.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type {BinaryLike} from 'node:crypto';
import {evidenceRecord,evidenceArray,evidenceText,evidenceRows} from './release-evidence.mts';
const root='test-results/performance-repair-20260928';
const version='20260928020000';
const changed=new Set(['challenge_suggestions_select_own','challenge_suggestions_update_admin']);
const read=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const save=(p:string,value:unknown)=>writeFileSync(`${root}/${p}`,typeof value==='string'?value:JSON.stringify(value,null,2),{flag:'wx'});
const hash=(s:BinaryLike)=>createHash('sha256').update(s).digest('hex');
const query=(file:string)=>{const out=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file',file],{encoding:'utf8',timeout:30000,maxBuffer:6e6});return evidenceRows(JSON.parse(out.slice(out.indexOf('{'))));};
const cleanPolicies=(ps:unknown)=>evidenceArray(ps).map(p=>p.schemaname==='public'&&p.tablename==='challenge_suggestions'&&changed.has(evidenceText(p.policyname))?{...p,qual:'approved replacement'}:p);
const compare=(a:Record<string,unknown>,b:Record<string,unknown>)=>{for(const k of ['functions','relations','triggers','role_settings','indexes','default_acl'])assert.deepEqual(a[k],b[k],k);assert.deepEqual(cleanPolicies(a.policies),cleanPolicies(b.policies));};
assert.equal(read('supabase/.temp/project-ref').trim(),'tvixsmqxotuvyjqzmjla');
mkdirSync(root,{recursive:true});
const mode=process.argv[2];
assert.ok(mode&&['capture','prepare','rehearsal','deploy','verify'].includes(mode));
if(mode==='capture') {
 const sql=read('scripts/portal-editorial-preflight.sql').replace("version='20260927030000'",`version='${version}'`);
 save('preflight.sql',sql);
 const baseline=evidenceRecord(query(`${root}/preflight.sql`)[0]?.baseline);
 assert.equal(baseline.migration_exists,false);
 save('database-before.json',baseline);
 console.log(JSON.stringify({captured:baseline.captured_at,functions:Object.keys(evidenceRecord(baseline.functions)).length,next:baseline.next_event,active:baseline.active_events,overdue:baseline.overdue_outbox}));
} else if(mode==='prepare') {
 const b=evidenceRecord(JSON.parse(read(`${root}/database-before.json`)));
 const snapshot=read(`${root}/preflight.sql`);const select=snapshot.slice(snapshot.indexOf('select jsonb_build_object('),snapshot.lastIndexOf('rollback;')).trim().replace(/;$/,'');
 const keys=['functions','policies','relations','triggers','role_settings','indexes','default_acl'];
 const baseline=JSON.stringify(Object.fromEntries(keys.map(k=>[k,b[k]])));
 const before=`create temp table repair_before on commit drop as ${select};\n`;
 const guard=`do $guard$ declare b jsonb;k text;x jsonb:=$baseline$${baseline}$baseline$::jsonb;begin
 select baseline into b from repair_before;
 foreach k in array array['${keys.join("','")}'] loop if b->k is distinct from x->k then raise exception 'Baseline drift: %',k;end if;end loop;
 if (b->>'migration_exists')::boolean or (b->>'active_events')::int<>0 or (b->>'overdue_outbox')::int<>0 or (b->>'lock_waits')::int<>0 or b->>'next_event' is null or (b->>'next_event')::timestamptz<clock_timestamp()+interval '25 minutes' then raise exception 'Unsafe release window';end if;
 if has_column_privilege('authenticated','public.profiles','is_admin','SELECT') then raise exception 'Profile privacy drift';end if;
 end $guard$;\n`;
 const migration=read(`supabase/migrations/${version}_repair_suggestion_profile_policy.sql`).replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
 const verify=`do $verify$ declare p record;begin
 if has_column_privilege('authenticated','public.profiles','is_admin','SELECT') then raise exception 'Profile privacy regression';end if;
 for p in select * from pg_policies where schemaname='public' and tablename='challenge_suggestions' and policyname in ('challenge_suggestions_select_own','challenge_suggestions_update_admin') loop
 if position('is_current_user_admin()' in p.qual)=0 or position('FROM profiles' in p.qual)>0 then raise exception 'Incorrect policy repair';end if;end loop;
 end $verify$;
 set local role authenticated;
 select count(*) as synthetic_member_visible_rows from public.challenge_suggestions where user_id='00000000-0000-4000-8000-000000000000'::uuid;
 reset role;\n`;
 const common="begin;set local lock_timeout='2s';set local statement_timeout='8s';\n"+before+guard+migration+verify;
 const originals=evidenceArray(b.policies).filter(p=>p.schemaname==='public'&&p.tablename==='challenge_suggestions'&&changed.has(evidenceText(p.policyname)));assert.equal(originals.length,2);
 const rollback=originals.map(p=>`alter policy ${p.policyname} on public.challenge_suggestions using (${p.qual});`).join('\n');
 save('common.sql',common);
 save('rehearsal.sql',common+rollback+'\nselect true as repaired_read_and_rollback_passed;rollback;');
 save('deploy.sql',common+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','repair_suggestion_profile_policy',array[$migration$${migration}$migration$]);notify pgrst,'reload schema';select clock_timestamp() as deployed_at;commit;`);
 save('rollback-body.sql',rollback);
 console.log('Prepared exact-policy migration, guards and rollback; no production changes.');
} else if(mode==='rehearsal'||mode==='deploy') {
 if(mode==='deploy'){assert.equal(process.argv[3],'--deploy-reviewed-artifact');assert.equal(JSON.parse(read(`${root}/rehearsal-result.json`)).commonHash,hash(read(`${root}/common.sql`)));save('database-deploy-started.json',{at:new Date().toISOString()});}
 const rows=query(`${root}/${mode}.sql`);save(`${mode}-result.json`,{at:new Date().toISOString(),commonHash:hash(read(`${root}/common.sql`)),rows});console.log(JSON.stringify(rows));
} else {
 const b=evidenceRecord(JSON.parse(read(`${root}/database-before.json`)));const a=evidenceRecord(query(`${root}/preflight.sql`)[0]?.baseline);
 assert.equal(a.migration_exists,true);compare(a,b);
 save('database-after.json',a);
 const expected=JSON.stringify(evidenceArray(a.policies).filter(p=>p.schemaname==='public'&&p.tablename==='challenge_suggestions'));
 save('rollback.sql',`begin;set local lock_timeout='2s';set local statement_timeout='8s';do $g$begin if (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='challenge_suggestions') is distinct from $p$${expected}$p$::jsonb then raise exception 'Rollback policy drift';end if;end $g$;\n${read(`${root}/rollback-body.sql`)}\nnotify pgrst,'reload schema';commit;`);
 console.log(JSON.stringify({verified:true,unchangedFunctions:Object.keys(evidenceRecord(a.functions)).length,unchangedGrantsTriggersAndOtherPolicies:true,at:a.captured_at,active:a.active_events,overdue:a.overdue_outbox}));
}
