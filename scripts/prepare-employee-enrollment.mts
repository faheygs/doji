// Produce an enrollment-only SQL release and preserve the live portal byte-for-byte.
// No cloud writes. The authorization/command migration is intentionally NOT included.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { evidenceRecord } from './release-evidence.mts';
import { readBrowserSource } from '../website/browser-source.mts';
const output = resolve('test-results/employee-enrollment-release');
await mkdir(output, { recursive: true });
const foundation = await readFile('docs/drafts/20260926010000_employee_identity_foundation.sql','utf8');
const authorization = await readFile('docs/drafts/20260926011000_employee_portal_authorization.sql','utf8');
const begin = authorization.indexOf('-- Fail closed on legacy PUBLIC/default grants.');
assert.ok(begin > 0);
let preflight = authorization.slice(begin).replace(/commit;\s*$/, '');
preflight = preflight.replace(/and p\.proname <> all\(array\[[\s\S]*?\]\)/,
  "and p.oid <> 'public.get_employee_registration_status_v1()'::regprocedure");
assert.ok(!preflight.includes("'admin_triage_report'"));
const sql = foundation.replace('-- DRAFT: NOT DEPLOYABLE. Scope approved; full-schema and hosted Auth tests pending.',
  '-- Enrollment-only release: no portal authorization, commands, actor FKs or cutover changes.')
  .replace(/commit;\s*$/, () => `${preflight}\nnotify pgrst, 'reload schema';\ncommit;\n`);
await writeFile(join(output,'enrollment.sql'),sql);
const guardStart = `
set local statement_timeout='15s';
create temporary table employee_release_before_functions on commit drop as
select p.oid,md5(pg_get_functiondef(p.oid)) body,
has_function_privilege('authenticated',p.oid,'EXECUTE') member,
has_function_privilege('anon',p.oid,'EXECUTE') anon
from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
create temporary table employee_release_before_tables on commit drop as
select c.oid,c.relrowsecurity,c.relforcerowsecurity,r.role,v.privilege,
has_table_privilege(r.role,c.oid,v.privilege) allowed
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('authenticated'),('anon')) r(role)
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRIGGER')) v(privilege)
where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m');
create temporary table employee_release_before_policies on commit drop as
select * from pg_policies where schemaname in ('public','storage');
`;
const guardEnd = `
do $$ begin
if exists(select 1 from employee_release_before_functions b left join pg_proc p on p.oid=b.oid
 where p.oid is null or md5(pg_get_functiondef(p.oid))<>b.body
 or has_function_privilege('authenticated',p.oid,'EXECUTE')<>b.member
 or has_function_privilege('anon',p.oid,'EXECUTE')<>b.anon) then
 raise exception 'Enrollment changed an existing function contract'; end if;
if exists(select 1 from employee_release_before_tables b left join pg_class c on c.oid=b.oid
 where c.oid is null or c.relrowsecurity<>b.relrowsecurity or c.relforcerowsecurity<>b.relforcerowsecurity
 or has_table_privilege(b.role,c.oid,b.privilege)<>b.allowed) then
 raise exception 'Enrollment changed an existing table contract'; end if;
if exists((select * from employee_release_before_policies except select * from pg_policies where schemaname in ('public','storage'))
 union all (select * from pg_policies where schemaname in ('public','storage') except select * from employee_release_before_policies)) then
 raise exception 'Enrollment changed an existing RLS policy'; end if;
end $$;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20260926030000','employee_enrollment_foundation',array['Enrollment-only foundation; exact SQL retained in repository release artifact.']);
`;
await writeFile(join(output,'deploy.sql'),sql.replace('begin;',()=>`begin;\n${guardStart}`).replace(/commit;\s*$/,()=>`${guardEnd}\ncommit;\n`));
await writeFile(join(output,'guard-test.sql'),`begin;\n${guardStart}\n${guardEnd}\nrollback;\n`);
console.log('Prepared enrollment-only SQL');
if (process.argv.includes('--sql-only')) process.exit(0);

const origin = 'https://admin.dojipro.com';
const site = join(output, 'site');
await mkdir(site,{recursive:true});
const manifest: {path: string;sha256: string}[]=[];
async function download(path: string) {
  const result = await fetch(`${origin}/${path}`,{signal:AbortSignal.timeout(15000)});
  assert.equal(result.status,200,`Existing live asset: ${path}`);
  const bytes=Buffer.from(await result.arrayBuffer());
  if (!path.endsWith('.html')) assert.ok(!String(result.headers.get('content-type')).includes('text/html'),`No HTML fallback: ${path}`);
  const target=join(site,path); await mkdir(dirname(target),{recursive:true}); await writeFile(target,bytes);
  manifest.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
  return bytes.toString();
}
const html=await download('index.html');
const bundle=html.match(/src="\/(admin-portal\/admin-app-[^"]+\.js)"/)?.[1];assert.ok(bundle);
const source=await download(bundle);
const configMatch=source.match(/window.DOJI_PORTAL_CONFIG = Object.freeze\(([\s\S]*?)\);/)?.[1];assert.ok(configMatch);
const config=evidenceRecord(JSON.parse(configMatch));
assert.notEqual(config.employeeAccountsEnabled,true,'Existing portal must remain legacy during enrollment');
async function files(dir: string,prefix=''): Promise<string[]> {
  const result: string[]=[];
  for(const item of await readdir(dir,{withFileTypes:true})) {
    const path=prefix+item.name;
    if(item.isDirectory()) result.push(...await files(join(dir,item.name),path+'/'));
    else result.push(path);
  }
  return result;
}
const inventory=await files('website/.admin-dist');
for(const path of inventory.filter(p=>p!=='index.html' && !p.startsWith('employee-setup/') && p!=='_headers' && !/admin-app-.*\.js$/.test(p))) await download(path);
// Check the locally retained security policy against the live response before reuse.
const headers=await readFile('website/_headers','utf8');
const live=await fetch(origin,{signal:AbortSignal.timeout(15000)});
const policy=headers.match(/Content-Security-Policy: ([^\r\n]+)/)?.[1];assert.ok(policy);
assert.equal(live.headers.get('content-security-policy'),policy,'Preserve current CSP');
await writeFile(join(site,'_headers'),headers+'\n/employee-setup/*\n  Cache-Control: no-store\n');
await cp('website/employee-setup',join(site,'employee-setup'),{recursive:true,filter: path=>!path.endsWith('.mts')});
await writeFile(join(site,'employee-setup/return.js'),readBrowserSource('employee-setup/return.js'));
await writeFile(join(site,'employee-setup/setup.js'),readBrowserSource('employee-setup/setup.js'));
await writeFile(join(site,'employee-setup/config.js'),`window.DOJI_EMPLOYEE_SETUP_CONFIG = Object.freeze(${JSON.stringify({supabaseUrl:config.supabaseUrl,supabaseAnonKey:config.supabaseAnonKey})});\n`);
await writeFile(join(output,'baseline-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Preserved ${manifest.length} live files; only employee-setup assets and their cache rule are added.`);
