// Owner-approved business-only release and one exact-alias re-arm, October 11.
// Never creates a provider account, submits credentials or sends email.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import { functions, secrets, pages, database, health } from './business-disabled-release-reads.mts';
import { evidenceRecord as record, evidenceRows as rows, evidenceArray as array } from './release-evidence.mts';

const root = 'test-results/business-password-release-20261011';
const secure = '.artifacts/business-recovery-acceptance-20261011';
const candidate = 'test-results/business-owned-candidate-AyD7m1';
const previous = 'test-results/business-owned-candidate-5IQNY1';
const priorPages = 'test-results/business-owned-switch-20261011/acceptance';
const slug = 'business-portal-v2';
const origin = 'https://business.dojipro.com';
const namespace = 'react-business/owned-20261010';
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(['prepare', 'edge', 'pages', 'rearm', 'verify'].includes(mode || ''));
const read = async (path: string) => record(JSON.parse(await readFile(path, 'utf8')));
const save = (name: string, value: unknown) => writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const query = (sql: string) => rows(cli(['db','query',sql,'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
const state = () => record(query(`begin read only;set local statement_timeout='3s';
select jsonb_build_object(
 'acceptance',(select to_jsonb(s) from business_session_private.owned_auth_acceptance s where singleton),
 'mail',(select to_jsonb(s) from business_session_private.owned_auth_mail_settings s where singleton),
 'settings',(select to_jsonb(s) from business_session_private.settings s where singleton),
 'enrollment',(select to_jsonb(s) from portal_identity_private.business_enrollment_settings s where singleton),
 'guard',(select to_jsonb(s) from business_session_private.owned_auth_settings s where singleton)) state;rollback;`)[0]?.state);
const sqlJson = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const manifest = await read(`${candidate}/manifest.json`);
const oldManifest = await read(`${previous}/manifest.json`);
const changed = Object.keys(record(manifest.files)).filter(p => p.startsWith('edge/') && record(manifest.files)[p] !== record(oldManifest.files)[p]);
assert.deepEqual(changed.map(p => p.split('/').at(-1)).sort(), [
 'business-owned-diagnostics.mts','business-owned-http.mts','business-owned-provider.mts','business-password-policy.mts',
]);
for (const [path, expected] of Object.entries(record(manifest.files))) {
 assert.ok(/^[A-Za-z0-9_./-]+$/.test(path) && !path.split('/').includes('..'));
 assert.equal(hash(await readFile(`${candidate}/${path}`)), expected, path);
}
async function currentConfig() {
 const digest = secrets().find(s => s.name === 'BUSINESS_V2_CONFIG')?.value;
 for (const file of await readdir(secure)) {
  if (!/^switch-runtime-acceptance-\d+\.env$/.test(file) && file !== 'password-release-runtime.env') continue;
  const raw = (await readFile(`${secure}/${file}`, 'utf8')).split('\n').find(l => l.startsWith('BUSINESS_V2_CONFIG='))?.slice('BUSINESS_V2_CONFIG='.length);
  if (raw && hash(raw) === digest) return { raw, config: record(JSON.parse(raw)) };
 }
 throw Error('No protected configuration matches the live secret; stop');
}
async function providerAbsent() {
 const { config } = await currentConfig();
 assert.equal(config.origin, origin);
 assert.equal(config.clientId, 'client_01M3T51363MDZZK6X8DB7NS32N');
 const email = (await readFile(`${secure}/acceptance-email.txt`, 'utf8')).trim();
 assert.match(email, /^[^\s<>@]+\+doji-business-test@gmail\.com$/);
 const u = new URL('https://api.workos.com/user_management/users');
 u.searchParams.set('email', email); u.searchParams.set('limit', '2');
 const r = await fetch(u, { headers: { authorization: `Bearer ${config.apiKey}` }, redirect:'error', signal:AbortSignal.timeout(15000) });
 assert.equal(r.status, 200, 'Exact identity read failed');
 const body = record(await r.json());
 assert.equal(body.object, 'list');
 assert.ok(Array.isArray(body.data));
 assert.equal(body.data.length, 0, 'Test identity exists; do not re-arm signup');
 assert.equal(record(body.list_metadata).after, null, 'Incomplete provider reconciliation');
 return { at: new Date().toISOString(), exactAliasMatches: 0, providerMutations: 0 };
}
async function verifySource(folder: string, source: string) {
 const actual = await inventory(folder), expected = await read(`${source}/manifest.json`);
 let checked = 0;
 for (const path of Object.keys(record(expected.files)).filter(p => p.startsWith('edge/supabase/functions/'))) {
  const matches = actual.filter(f => f.path.endsWith('/' + path.split('/').at(-1)));
  assert.equal(matches.length, 1, path);
  assert.equal(hash((await readFile(`${folder}/${matches[0]!.path}`, 'utf8')).replaceAll('\r\n','\n')), hash((await readFile(`${source}/${path}`, 'utf8')).replaceAll('\r\n','\n')), path);
  checked++;
 }
 assert.equal(checked, Number(expected.runtimeFiles) + 2);
 return checked;
}
async function boundaries(edge: boolean, frontend: boolean, refreshed = false) {
 const b = await read(`${root}/baseline.json`), db = database();
 assert.equal(db.event_window, false, 'Protected Doji window');
 assert.equal(db.overdue_sample, 0, 'Delivery backlog');
 for (const k of ['contracts','policies','roles']) assert.equal(db[k], record(b.database)[k], k);
 const fns = functions();
 assert.equal(fns.length, array(b.functions).length);
 for (const old of array(b.functions)) {
  const current = fns.find(f => f.id === old.id); assert.ok(current);
  if (old.slug === slug && edge) {
   assert.equal(current.version, Number(old.version)+1+(refreshed?1:0));
   assert.equal(current.verify_jwt, old.verify_jwt); assert.equal(current.status,'ACTIVE');
  } else assert.deepEqual(current, refreshed ? {...old,version:Number(old.version)+1} : old);
 }
 const p = await pages();
 for (const name of frontend ? ['doji-admin','doji-site'] : ['doji-admin','doji-site','doji-business']) assert.deepEqual(p[name],record(b.pages)[name]);
 const s = secrets(); assert.equal(s.length,array(b.secrets).length);
 for (const old of array(b.secrets)) {
  if (refreshed && old.name === 'BUSINESS_V2_CONFIG') continue;
  assert.equal(s.find(v => v.name === old.name)?.value,old.value,String(old.name));
 }
 if (!refreshed) assert.deepEqual(state(),b.state,'Acceptance state drift');
 const currentProject = record(await cf('/pages/projects/doji-business'));
 assert.equal(hash(JSON.stringify(currentProject.deployment_configs)),b.pagesConfigHash,'Pages environment changed');
}
async function verifyHosted() {
 const expected = await inventory(`${root}/site`);
 for (const path of ['business-portal/access/index.html',`${namespace}/release-config.js`,...expected.filter(f=>f.path.startsWith(`${namespace}/assets/`) && Object.keys(record(manifest.files)).some(p=>p===`frontend/assets/${f.path.split('/').at(-1)}`)).map(f=>f.path)]) {
  const route = path==='business-portal/access/index.html' ? '/business-portal/access/' : '/' + path;
  const r = await fetch(origin+route,{signal:AbortSignal.timeout(15000),cache:'no-store'});
  assert.equal(r.status,200,route);
  assert.equal(hash(Buffer.from(await r.arrayBuffer())),expected.find(f=>f.path===path)?.sha256,route);
 }
 for (const [path, status] of [['/auth/owned/bootstrap',200],['/api/session',401],['/auth/callback',404]] as const) {
  const r = await fetch(origin+path,{headers:{origin},redirect:'manual',signal:AbortSignal.timeout(15000)});
  await r.body?.cancel(); assert.equal(r.status,status,path);
 }
}
async function verifyFieldError() {
 const {config}=await currentConfig();
 const before=state();
 const boot=await fetch(origin+'/auth/owned/bootstrap',{headers:{origin},signal:AbortSignal.timeout(15000)});
 assert.equal(boot.status,200);
 const bootstrap=record(await boot.json());
 const binding=boot.headers.getSetCookie().find(c=>c.startsWith('__Host-doji_business_owned_binding='))?.split(';')[0];
 assert.ok(binding); assert.equal(typeof bootstrap.csrf,'string');
 // Deliberately invalid synthetic input: validation stops before admission, proof,
 // provider I/O, legal acceptance persistence, account creation or email delivery.
 const result=await fetch(origin+'/auth/owned/register',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin','x-doji-csrf':String(bootstrap.csrf),cookie:binding},
  body:JSON.stringify({email:'release-probe@example.invalid',password:'tiny',proof:'invalid-release-proof',country:'US',termsAccepted:true,privacyAcknowledged:true,termsVersion:config.termsVersion,privacyVersion:config.privacyVersion}),
 });
 assert.equal(result.status,422);
 assert.deepEqual(await result.json(),{field:'password',code:'password_too_short'});
 assert.equal(result.headers.getSetCookie().length,0);
 assert.deepEqual(state(),before,'Negative validation probe changed acceptance state');
 return {status:422,code:'password_too_short',accountCreation:false,emailSending:false};
}
if (mode === 'prepare') {
 await assert.rejects(access(`${root}/baseline.json`)); await mkdir(root,{recursive:true});
 const db=database(); assert.equal(db.event_window,false); assert.equal(db.overdue_sample,0);
 const p=await pages(), project=record(await cf('/pages/projects/doji-business'));
 const oldPages=await read('test-results/business-owned-switch-20261011/pages-acceptance.json');
 assert.deepEqual(p['doji-business'],oldPages.deployment);
 assert.deepEqual(await inventory(priorPages),oldPages.assets);
 const gate=state(); assert.equal(record(gate.acceptance).reserved_at,'2026-10-11T17:00:53.215+00:00');
 const provider=await providerAbsent();
 const { raw }=await currentConfig();
 await writeFile(`${secure}/password-release-runtime-before.json`,raw,{flag:'wx',mode:0o600});
 const until=new Date(Date.now()+3600000).toISOString();
 await save('baseline',{at:new Date().toISOString(),database:db,functions:functions(),secrets:secrets(),pages:p,state:gate,pagesConfigHash:hash(JSON.stringify(project.deployment_configs)),provider,until});
 await mkdir(`${root}/edge-before`);
 cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'edge-before')],false);
 await verifySource(`${root}/edge-before`,previous);
 await cp(priorPages,`${root}/site`,{recursive:true,errorOnExist:true});
 await cp(`${candidate}/frontend/assets`,`${root}/site/${namespace}/assets`,{recursive:true});
 const html=(await readFile(`${candidate}/frontend/index.html`,'utf8')).replace('Doji for Business · Migration preview','Doji for Business').replace('<head>',`<head><script src="/${namespace}/release-config.js"></script><script src="/business-portal/config.js"></script><link rel="icon" href="/doji-icon.png">`);
 assert.match(html,/src="\/react-business\/owned-20261010\/assets\//);
 for (const path of ['index.html','business-portal/access/index.html','business-portal/application/index.html']) await writeFile(`${root}/site/${path}`,html);
 const releaseConfig: Record<string, unknown>={...record(oldPages.releaseConfig),acceptanceUntil:until};
 assert.equal(releaseConfig.ownedAuthEnabled,true); assert.equal(releaseConfig.maintenanceEnabled,false);
 await writeFile(`${root}/site/${namespace}/release-config.js`,`window.DOJI_REACT_BUSINESS_CONFIG = Object.freeze(${JSON.stringify(releaseConfig)});\n`);
 for(const f of ['_worker.js','_headers','_routes.json','_redirects','business-portal/config.js','business-terms/index.html','business-privacy/index.html']) assert.equal(hash(await readFile(`${root}/site/${f}`)),hash(await readFile(`${priorPages}/${f}`)),f);
 assert.equal(hash(await readFile(`${root}/site/_worker.js`)),record(manifest.files)['pages-components/_worker.js']);
 await save('prepared',{candidate,changed,until,site:await inventory(`${root}/site`),rollback:await inventory(`${root}/edge-before`)});
 console.log(JSON.stringify({prepared:true,provider,until,productionWrites:0}));
} else {
 const b=await read(`${root}/baseline.json`), prepared=await read(`${root}/prepared.json`);
 assert.deepEqual(await inventory(`${root}/site`),prepared.site); assert.deepEqual(await inventory(`${root}/edge-before`),prepared.rollback);
 if(mode==='edge') {
  await boundaries(false,false);
  await save('edge-started',{at:new Date().toISOString()});
  await writeFile(`${candidate}/edge/supabase/config.toml`,`project_id="business-password-feedback"\n[functions.${slug}]\nverify_jwt=false\nimport_map="./functions/${slug}/deno.json"\n`,{flag:'wx'});
  cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',resolve(candidate,'edge')],false);
  await boundaries(true,false);
  await mkdir(`${root}/edge-after`);
  cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'edge-after')],false);
  await save('edge-verified',{at:new Date().toISOString(),files:await verifySource(`${root}/edge-after`,candidate)});
  console.log('Business runtime deployed and exact source verified; other systems unchanged.');
 } else if(mode==='pages') {
  await read(`${root}/edge-verified.json`); await boundaries(true,false);
  await save('pages-started',{at:new Date().toISOString(),rollback:record(record(b.pages)['doji-business']).id});
  try { execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',resolve(root,'site'),'--project-name','doji-business','--branch','main','--commit-dirty=true','--commit-message','Business password checklist and safe validation feedback'],{env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000}); }
  catch {throw Error('Pages outcome uncertain; inspect before retry');}
  await boundaries(true,true);
  await save('pages-deployed',{at:new Date().toISOString(),deployment:(await pages())['doji-business']});
  console.log('Business frontend deployed; signup slot remains closed pending reconciliation.');
 } else if(mode==='rearm') {
  await read(`${root}/pages-deployed.json`); await boundaries(true,true); await verifyHosted();
  const provider=await providerAbsent();
  assert.ok(Date.parse(String(b.until))-Date.now()>15*60000,'Insufficient time remains; no automatic extension');
  const old=record(b.state), acceptance=record(old.acceptance), enrollment=record(old.enrollment);
  assert.equal(Number(enrollment.account_limit)-Number(enrollment.accounts_used),1,'Existing one-account enrollment allowance changed');
  const until=String(b.until); assert.ok(Number.isFinite(Date.parse(until)));
  await save('rearm-started',{at:new Date().toISOString(),provider,until,additionalCreateAttempts:1,oldReservationPreservedInBaseline:true});
  query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';
   do $$begin
    if not pg_try_advisory_xact_lock(hashtextextended('doji-business-owned-auth-v1',0)) then raise exception 'Concurrent business release';end if;
    if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1)
     or exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1) then raise exception 'Protected delivery window';end if;
    if (select to_jsonb(s) from business_session_private.owned_auth_acceptance s where singleton) is distinct from ${sqlJson(acceptance)} then raise exception 'Acceptance drift';end if;
    if (select to_jsonb(s) from portal_identity_private.business_enrollment_settings s where singleton) is distinct from ${sqlJson(enrollment)} then raise exception 'Enrollment drift';end if;
    if has_function_privilege('doji_business_session','business_session_private.admit_owned_auth_v1(text,text,text,text,text)','execute')
     or has_function_privilege('doji_business_session','business_session_private.put_bound_session(text,text,text,integer,text,text,text,text)','execute')
     or has_function_privilege('doji_business_session','business_session_private.execute_store(text,text,text,text,text,integer,text,text)','execute') then raise exception 'Legacy access reachable';end if;
   end$$;
   update business_session_private.owned_auth_acceptance set enabled=true,started_at=clock_timestamp(),expires_at='${until}',reserved_at=null,reservation_hash=null,agreement_hmac=null where singleton;
   update portal_identity_private.business_enrollment_settings set admission_until='${until}' where singleton;
   update business_session_private.owned_auth_mail_settings set enabled_until='${until}' where singleton;
   commit;`);
  const { config }=await currentConfig(), owned=record(config.ownedAuth);
  const next={...config,ownedAuth:{...owned,recoveryEmail:{...record(owned.recoveryEmail),capacityApprovedUntil:Date.parse(until)}}};
  const envPath=`${secure}/password-release-runtime.env`;
  await writeFile(envPath,`BUSINESS_V2_CONFIG=${JSON.stringify(next)}\n`,{flag:'wx',mode:0o600});
  cli(['secrets','set','--env-file',resolve(envPath),'--project-ref',ref],false);
  assert.equal(secrets().find(s=>s.name==='BUSINESS_V2_CONFIG')?.value,hash(JSON.stringify(next)));
  await boundaries(true,true,true);
  const after=state();
  assert.deepEqual(after.settings,old.settings); assert.deepEqual(after.guard,old.guard);
  assert.deepEqual(after.enrollment,{...enrollment,admission_until:until.replace('Z','+00:00')});
  assert.deepEqual(after.mail,{...record(old.mail),enabled_until:until.replace('Z','+00:00')});
  const a=record(after.acceptance);
  assert.equal(a.reserved_at,null); assert.equal(a.scope_hash,acceptance.scope_hash); assert.equal(a.identity_hmac,acceptance.identity_hmac);
  assert.equal(Date.parse(String(a.expires_at)),Date.parse(until));
  await save('rearmed',{at:new Date().toISOString(),until,oneAttempt:true,publicSignupUnchanged:true,mailCountersUnchanged:true,providerMutations:0});
  console.log(JSON.stringify({rearmed:true,until,publicSignup:false,emailsSent:0}));
 } else {
  await read(`${root}/rearmed.json`); await boundaries(true,true,true); await verifyHosted();
  await mkdir(`${root}/final-source`);
  cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'final-source')],false);
  await save('verified',{at:new Date().toISOString(),files:await verifySource(`${root}/final-source`,candidate),fieldError:await verifyFieldError(),health:await health(),until:b.until,memberContractsUnchanged:true});
  console.log(JSON.stringify({liveVerified:true,until:b.until,providerMutations:0}));
 }
}
