// Immutable local assembly for the separately approved gated rollout.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomBytes,pbkdf2Sync,createHash,createHmac} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build} from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import {hash,inventory,ref} from './prepare-safety-launch.mts';
import {evidenceRecord as record} from './release-evidence.mts';
const root='test-results/business-onboarding-release-20261011',secure='.artifacts/business-onboarding-release-20261011';
const namespace='/react-business/onboarding-20261011/';
await access(`${root}/database-verified.json`);await assert.rejects(access(`${root}/apps.json`));
const read=async(p:string)=>record(JSON.parse(await readFile(p,'utf8')));
const before=await read(`${secure}/runtime-before.json`);
const runtime:Record<string,unknown>={...before,setupEnabled:true};
assert.equal(runtime.signupEnabled,false);assert.equal(record(runtime.ownedAuth).acceptanceOnly,true);
const db={...record(before.database),username:`doji_business_mail_login.${ref}`,password:randomBytes(48).toString('base64url')};
const recovery=record(record(before.ownedAuth).recoveryEmail);
const mail={enabled:true,setupEnabled:true,clientId:before.clientId,workosKey:before.apiKey,resendKey:recovery.apiKey,
 from:'accounts@mail.dojipro.com',allowedRecipient:'faheygs+doji-business-test@gmail.com',signingKey:randomBytes(32).toString('hex'),database:db};
assert.equal(recovery.from,'Doji for Business <accounts@mail.dojipro.com>');
assert.ok(typeof mail.resendKey==='string'&&mail.resendKey.startsWith('re_'));
await writeFile(`${secure}/runtime-after.json`,JSON.stringify(runtime),{flag:'wx'});
await writeFile(`${secure}/mail.json`,JSON.stringify(mail),{flag:'wx'});
await writeFile(`${secure}/release.env`,`BUSINESS_V2_CONFIG=${JSON.stringify(runtime)}\nBUSINESS_APPLICATION_MAIL_CONFIG=${JSON.stringify(mail)}\n`,{flag:'wx'});
const salt=randomBytes(16),salted=pbkdf2Sync(db.password,salt,4096,32,'sha256');
const stored=createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64');
const server=createHmac('sha256',salted).update('Server Key').digest('base64');
const verifier=`SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
const addon=(await readFile('docs/drafts/business_email_hosted_v1.sql','utf8')).replace(/^begin;|^commit;/gm,'');
const ddl=`begin;set local lock_timeout='2s';set local statement_timeout='8s';
do $$begin
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1) or exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1) then raise exception 'Protected member window';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('doji-business-mail-hosted-v1',0)) then raise exception 'Concurrent release';end if;
end$$;
create temp table mail_existing_functions as select oid,pg_get_functiondef(oid) definition,proacl from pg_proc where prokind='f';
${addon}
create role doji_business_mail_login login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2 password '${verifier}';
grant connect on database postgres to doji_business_mail_login;
grant doji_business_mail to doji_business_mail_login with inherit false,set true;
alter role doji_business_mail_login set statement_timeout='3s';
alter role doji_business_mail_login set lock_timeout='1s';
alter role doji_business_mail_login set idle_in_transaction_session_timeout='4s';
update business_private.email_sender_settings set signing_key='${mail.signingKey}' where singleton;
do $$begin
 if exists(select 1 from mail_existing_functions b left join pg_proc p on p.oid=b.oid where p.oid is null or b.definition is distinct from pg_get_functiondef(p.oid) or b.proacl is distinct from p.proacl) then raise exception 'Existing function changed';end if;
 if exists(select 1 from pg_auth_members where member='doji_business_mail_login'::regrole and (roleid<>'doji_business_mail'::regrole or admin_option or inherit_option or not set_option)) then raise exception 'Sender membership invalid';end if;
 if exists(select 1 from business_private.email_sender_settings where enabled) or exists(select 1 from business_private.email_settings where sending_enabled or capture_enabled) then raise exception 'Sender unexpectedly enabled';end if;
end$$;commit;`;
await writeFile(`${secure}/mail-install.sql`,ddl,{flag:'wx'});
await writeFile(`${secure}/mail-rehearse.sql`,ddl.replace(/commit;$/,'rollback;'),{flag:'wx'});
await writeFile(`${root}/mail-stop.sql`,await readFile('docs/drafts/business_email_hosted_v1.rollback.sql'),{flag:'wx'});
await writeFile(`${root}/mail-login-stop.sql`,"begin;alter role doji_business_mail_login nologin;revoke doji_business_mail from doji_business_mail_login;commit;",{flag:'wx'});
await cp(`${root}/pages-before`,`${root}/site`,{recursive:true,errorOnExist:true});
await cp('web/apps/business/dist/assets',`${root}/site${namespace}assets`,{recursive:true});
const oldConfig=await readFile(`${root}/pages-before/react-business/owned-20261010/release-config.js`,'utf8');
const releaseConfig:Record<string,unknown>={...record(JSON.parse(oldConfig.match(/Object\.freeze\((.+)\);/)![1]!)),setupEnabled:true};
assert.equal(releaseConfig.acceptanceExistingAccount,true);assert.equal(releaseConfig.ownedAuthEnabled,true);
await writeFile(`${root}/site${namespace}release-config.js`,`window.DOJI_REACT_BUSINESS_CONFIG = Object.freeze(${JSON.stringify(releaseConfig)});\n`);
const html=(await readFile('web/apps/business/dist/index.html','utf8')).replace('Doji for Business · Migration preview','Doji for Business').replace('<head>',`<head><script src="${namespace}release-config.js"></script><script src="/business-portal/config.js"></script><link rel="icon" href="/doji-icon.png">`);
assert.ok(html.includes(namespace+'assets/'));
for(const path of ['index.html','business-portal/access/index.html','business-portal/application/index.html','business-portal/setup/index.html']) {
 await mkdir(dirname(`${root}/site/${path}`),{recursive:true});await writeFile(`${root}/site/${path}`,html);
}
const worker=await build({entryPoints:['infra/portal-identity-candidate/business-pages-worker.mts'],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*'],logLevel:'silent'});
await writeFile(`${root}/site/_worker.js`,worker.outputFiles[0]!.contents);
for(const path of ['_headers','_routes.json','_redirects','business-portal/config.js','business-terms/index.html','business-privacy/index.html']) assert.equal(hash(await readFile(`${root}/site/${path}`)),hash(await readFile(`${root}/pages-before/${path}`)),path);
for(const slug of ['business-portal-v2','business-application-mail']) {
 const dest=`${root}/edge/supabase/functions/${slug}`;await mkdir(dest,{recursive:true});
 const edge=await build({entryPoints:[`supabase/functions/${slug}/index.ts`],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','pg','jose'],logLevel:'silent'});
 await writeFile(`${dest}/index.ts`,edge.outputFiles[0]!.contents,{flag:'wx'});
 await cp(`supabase/functions/${slug}/deno.json`,`${dest}/deno.json`);
}
await writeFile(`${root}/edge/supabase/config.toml`,['project_id="business-onboarding"',...['business-portal-v2','business-application-mail'].map(s=>`[functions.${s}]\nverify_jwt=false\nimport_map="./functions/${s}/deno.json"`)].join('\n'),{flag:'wx'});
const files=await inventory(`${root}/site${namespace}assets`);let coreGzip=0;
for(const f of files.filter(f=>f.path.endsWith('.js')&&!f.path.startsWith('password-strength-'))) coreGzip+=gzipSync(await readFile(`${root}/site${namespace}assets/${f.path}`)).length;
assert.ok(coreGzip<256*1024,'Onboarding frontend package exceeds 256 KiB compressed');
await writeFile(`${root}/apps.json`,JSON.stringify({at:new Date().toISOString(),site:await inventory(`${root}/site`),edge:await inventory(`${root}/edge`),runtimeHash:hash(JSON.stringify(runtime)),mailHash:hash(JSON.stringify(mail)),mailInstallHash:hash(ddl),mailSourceHash:hash(await readFile('docs/drafts/business_email_hosted_v1.sql')),coreGzip,releaseConfig},null,2),{flag:'wx'});
console.log(JSON.stringify({prepared:true,coreGzip,publicSignup:false,mailCapture:false,mailAcceptanceLimit:1,automaticPolling:false}));
