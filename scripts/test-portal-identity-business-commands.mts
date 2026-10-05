// Offline synthetic PostgreSQL, all changes roll back. No provider calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { engine as podman, container } from './database/owned-target.mts';
import { offlineContainer, errorOutput } from './database/contracts.mts';
const info = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const body = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const sql = `begin;
do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic database required';end if;end$$;
${body('docs/drafts/business_applications_v1.sql')}
${body('docs/drafts/business_signup_legal_v1.sql')}
create temp table before_rpc as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','business_private') and p.prokind='f';
create temp table before_auth as select id,md5(row_to_json(u)::text) fingerprint from auth.users u;
${body('docs/drafts/portal_identity_registry_v1.sql')}
${body('docs/drafts/portal_identity_business_commands_v1.sql')}
grant doji_identity_resolver to postgres;
${readFileSync('scripts/test-portal-identity-business-commands.sql', 'utf8')}
select pg_temp.ok(not exists(select 1 from before_rpc f join pg_proc p on p.oid=f.oid where f.proacl is distinct from p.proacl),'existing function grants preserved during extraction');
select pg_temp.ok(not exists(select 1 from before_rpc f join pg_proc p on p.oid=f.oid where f.oid<>'public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure and f.definition is distinct from pg_get_functiondef(p.oid)),'only approved business command wrapper changed');
${body('docs/drafts/portal_identity_business_commands_v1.rollback.sql')}
select pg_temp.ok(not exists(select 1 from before_rpc f join pg_proc p on p.oid=f.oid where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'rollback restores exact RPC definitions and grants');
select pg_temp.ok(not (select enabled from portal_identity_private.business_command_settings),'rollback freezes external commands');
select pg_temp.ok(not has_function_privilege('doji_identity_resolver','portal_identity_private.business_application_command(text,text,text,text,boolean,text,bigint,jsonb,text,text,uuid)','execute'),'rollback removes external command grant');
select pg_temp.ok((select count(*)=2 from business_private.receipts),'rollback preserves receipts and submitted data');
select pg_temp.ok(not exists(select * from before_auth except select id,md5(row_to_json(u)::text) from auth.users u) and not exists(select id,md5(row_to_json(u)::text) from auth.users u except select * from before_auth),'shared Auth fingerprint unchanged');
rollback;`;
try {
  const output = execFileSync(
    podman,
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-qAt',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 4e6, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const checks = output.split('\n').filter((l) => l.startsWith('PASS:'));
  console.log(checks.join('\n'));
  console.log(`${checks.length} external business command checks passed; transaction rolled back.`);
  const drift = `do $drift$declare definition text; begin
    definition:=pg_get_functiondef('public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure);
    execute replace(definition,'BEGIN','BEGIN -- synthetic source drift');
    -- Lowercase source bodies are also supported by this test mutation.
    if definition=pg_get_functiondef('public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure) then
      execute replace(definition,'begin','begin -- synthetic source drift');
    end if;
  end$drift$;`;
  const prefix = `begin;
    ${body('docs/drafts/business_applications_v1.sql')}
    ${body('docs/drafts/business_signup_legal_v1.sql')}
    ${body('docs/drafts/portal_identity_registry_v1.sql')}`;
  for (const [label, input, expected] of [
    [
      'source drift refuses command extraction',
      prefix + drift + body('docs/drafts/portal_identity_business_commands_v1.sql'),
      /Business command source changed/,
    ],
    [
      'rollback refuses to overwrite an intervening command',
      prefix +
        body('docs/drafts/portal_identity_business_commands_v1.sql') +
        drift +
        body('docs/drafts/portal_identity_business_commands_v1.rollback.sql'),
      /intervening change requires review/,
    ],
  ] as const) {
    assert.throws(
      () =>
        execFileSync(
          podman,
          [
            'exec',
            '-i',
            container,
            'psql',
            '-X',
            '-qAt',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-v',
            'ON_ERROR_STOP=1',
          ],
          { input, encoding: 'utf8', maxBuffer: 4e6, stdio: ['pipe', 'pipe', 'pipe'] },
        ),
      (error: unknown) => expected.test(errorOutput(error, 'stderr')),
    );
    console.log('PASS: ' + label + '; aborted transaction rolled back');
  }
  console.log('2 source/rollback drift guard checks passed.');
} catch (e) {
  console.error(errorOutput(e, 'stderr'));
  process.exitCode = 1;
}
