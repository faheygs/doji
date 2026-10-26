// Pure preparation: consumes reviewed function definitions; never opens a database.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { employeeRouteContracts } from '../infra/portal-identity/employee-route-contracts.mts';
import { employeeHistoryContracts } from '../infra/portal-identity/employee-history-contracts.mts';
import { employeeAnnouncementContract } from '../infra/portal-identity/employee-announcement-contracts.mts';
import { employeeWorkflowContracts } from '../infra/portal-identity/employee-workflow-contracts.mts';

export interface DevelopmentDefinition {
  schema: string;
  name: string;
  signature: string;
  definition: string;
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const md5 = (value: string) => createHash('md5').update(value).digest('hex');
const textArray = (values: readonly string[]) => `array[${values.map(quote).join(',')}]::text[]`;
const schemas = [
  'public',
  'business_private',
  'safety_private',
  'moderation_private',
  'staff_workflow_private',
];
const workflowEntries = Object.entries(employeeWorkflowContracts).filter(
  ([name]) => name !== 'get_admin_staff_event_channels_v1',
);
const routeTarget = (name: string) =>
  name === 'get_admin_employee_directory_v1'
    ? 'portal_identity_private.employee_directory_v1'
    : name === 'admin_set_employee_role_v1'
      ? 'portal_identity_private.employee_role_command_v1'
      : name === 'get_admin_case_assignees_v1'
        ? 'staff_workflow_private.assignees'
        : `public.${name}`;

// Add resource authorization only; signing remains outside the SQL transaction.
export function buildAdminDevelopmentResourceSql(definitions: readonly DevelopmentDefinition[]) {
  const signatures = [
    'public.employee_can_read_report_evidence_v1(text)',
    'public.employee_can_read_avatar_evidence_v1(text)',
    'public.employee_can_read_preserved_media_v1(text)',
    'public.get_admin_staff_event_channels_v1()',
  ];
  const checks = signatures
    .map((signature) => {
      const matches = definitions.filter((d) => d.signature.replaceAll(' ', '') === signature);
      if (matches.length !== 1)
        throw Error(`One reviewed resource definition required: ${signature}`);
      return `if md5(pg_get_functiondef(${quote(signature)}::regprocedure))<>${quote(md5(matches[0]!.definition))} then
 raise exception 'Resource permission definition drifted';end if;`;
    })
    .join('\n');
  const guard = `begin;set local lock_timeout='2s';set local statement_timeout='15s';
do $guard$begin
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
 and issuer='https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD'
 and audience='client_01M51GRQJVKXFZ98RG21MK7J64') then
 raise exception 'Shared staging employee realm required';end if;
 ${checks}
end$guard$;
lock table admin_development_private.routes in exclusive mode;`;
  const signature = 'admin_development_private.evidence_authorization_v1(text,text)';
  const body = String.raw`begin
 if auth.jwt()->>'aal' is distinct from 'staging_development'
 or not admin_development_private.assurance_v1(auth.jwt()->>'aal')
 or p_path is null or length(p_path) not between 1 and 1024
 or p_path ~ '[%?#\\]' or p_path ~ '[[:cntrl:]]'
 or p_path ~ '(^|/)(\.|\.\.)?(/|$)'
 or not coalesce(case p_bucket
 when 'post-media' then public.employee_can_read_report_evidence_v1(p_path)
 when 'avatars' then public.employee_can_read_avatar_evidence_v1(p_path)
 when 'moderation-evidence' then public.employee_can_read_preserved_media_v1(p_path)
 else false end,false) then
 raise exception using errcode='42501',message='Evidence access denied';end if;
 return jsonb_build_object('bucket',p_bucket,'path',p_path,'expiresIn',300);
end`;
  const rows = [
    `'portal_evidence_authorization_v1',${quote(signature)}::regprocedure,array['p_bucket','p_path']::text[],array['text','text']::text[],'{}'::jsonb`,
    `'get_admin_staff_event_channels_v1','public.get_admin_staff_event_channels_v1()'::regprocedure,array[]::text[],array[]::text[],'{}'::jsonb`,
  ];
  return {
    apply: `${guard}
create function ${signature.replace('(text,text)', '(p_bucket text,p_path text)')} returns jsonb
language plpgsql security definer set search_path='' as ${quote(body)};
revoke all on function ${signature} from public,anon,authenticated,service_role,doji_employee,doji_business,doji_staging_development;
insert into admin_development_private.routes values ${rows.map((row) => `(${row})`).join(',')};
commit;`,
    rollback: `${guard}
do $undo$begin
 if not exists(select 1 from pg_proc where oid=${quote(signature)}::regprocedure
 and prosrc=${quote(body)} and prosecdef and proconfig=array['search_path=""']::text[]
 and proowner=(select oid from pg_roles where rolname='postgres')) then
 raise exception 'Resource adapter definition drifted';end if;
 ${rows.map((row) => `if not exists(select 1 from admin_development_private.routes where (name,target,fields,types,defaults)=row(${row})) then raise exception 'Resource route drifted';end if;`).join('\n')}
end$undo$;
delete from admin_development_private.routes where name in ('portal_evidence_authorization_v1','get_admin_staff_event_channels_v1');
drop function ${signature};
commit;`,
  };
}

// Add only missing local workflow routes; never replay the installed adapter.
export function buildAdminDevelopmentWorkflowSql(definitions: readonly DevelopmentDefinition[]) {
  const rows = workflowEntries.map(([name, contract]) => {
    const signature = `${routeTarget(name)}(${contract.types.join(',')})`;
    const matches = definitions.filter(
      (d) => d.signature.replaceAll(' ', '') === signature.replaceAll(' ', ''),
    );
    if (matches.length !== 1) throw Error(`One reviewed workflow definition required: ${name}`);
    return {
      name,
      signature,
      hash: md5(matches[0]!.definition),
      values: `${quote(name)},${quote(signature)}::regprocedure,${textArray(contract.fields)},${textArray(contract.types)},${quote(JSON.stringify(contract.defaults))}::jsonb`,
    };
  });
  const guard = `begin;set local lock_timeout='2s';set local statement_timeout='15s';
do $guard$begin
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
 and issuer='https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD'
 and audience='client_01M51GRQJVKXFZ98RG21MK7J64') then
 raise exception 'Shared staging employee realm required';end if;
end$guard$;
lock table admin_development_private.routes in exclusive mode;`;
  const checks = rows
    .map(
      (r) => `do $check$begin
 if md5(pg_get_functiondef(${quote(r.signature)}::regprocedure))<>${quote(r.hash)} then
 raise exception 'Reviewed workflow definition changed';end if;
end$check$;`,
    )
    .join('\n');
  return {
    apply: `${guard}\n${checks}\ninsert into admin_development_private.routes values\n${rows.map((r) => `(${r.values})`).join(',\n')};\ncommit;`,
    rollback: `${guard}\n${checks}\n${rows
      .map(
        (r) => `do $undo$begin
 if not exists(select 1 from admin_development_private.routes where
 (name,target,fields,types,defaults)=row(${r.values})) then
 raise exception 'Development workflow route drifted';end if;
 delete from admin_development_private.routes where name=${quote(r.name)};
end$undo$;`,
      )
      .join('\n')}\ncommit;`,
  };
}
const claim = String.raw`auth\.jwt\(\)\s*->>\s*'aal'`;
const expression = String.raw`(?:coalesce\(\s*(?:\(\s*select\s+${claim}\s*\)|${claim})\s*,\s*''\s*\)|${claim})`;
const condition = new RegExp(String.raw`${expression}\s*(is distinct from|<>|=)\s*'aal2'`, 'gi');

export function developmentGate(definition: DevelopmentDefinition): string | null {
  if (
    !schemas.includes(definition.schema) ||
    !(
      /^(admin_|get_admin_|employee_)/.test(definition.name) ||
      /doji_employee|public\.admin_user_has_permission/.test(definition.definition)
    )
  )
    return null;
  let matches = 0;
  const changed = definition.definition.replace(condition, (_whole, comparison: string) => {
    matches++;
    return `${comparison === '=' ? '' : 'not '}admin_development_private.assurance_v1(auth.jwt()->>'aal')`;
  });
  if (!matches) return null;
  // Unknown assurance constructs require a fresh review, not a best-effort rewrite.
  if (changed.includes("'aal2'"))
    throw Error(`Unrecognized assurance guard: ${definition.signature}`);
  return changed;
}

export function buildAdminDevelopmentSql(definitions: readonly DevelopmentDefinition[]): string {
  if (
    !definitions.length ||
    new Set(definitions.map((d) => d.signature)).size !== definitions.length
  )
    throw Error('Unique reviewed function definitions required');
  const patches: string[] = [];
  for (const definition of definitions) {
    const changed = developmentGate(definition);
    if (!changed) continue;
    if (!/^[a-z_]+$/.test(definition.schema) || !/^[a-z0-9_]+$/.test(definition.name))
      throw Error('Invalid function identity');
    patches.push(`do $patch$declare current_definition text;begin
 select pg_get_functiondef(${quote(definition.signature)}::regprocedure) into current_definition;
 if md5(current_definition)<>${quote(md5(definition.definition))} then
  raise exception 'Reviewed staging definition changed: %',${quote(definition.signature)};end if;
 execute ${quote(changed)};
 insert into admin_development_private.restore values(${quote(definition.signature)},current_definition,
  md5(pg_get_functiondef(${quote(definition.signature)}::regprocedure)));
end$patch$;`);
  }
  if (!definitions.some((d) => d.name === 'admin_user_has_permission' && developmentGate(d)))
    throw Error('Reviewed employee permission gate required');
  const contracts = {
    ...employeeRouteContracts,
    ...employeeHistoryContracts,
    ...employeeWorkflowContracts,
    admin_announcement_compose_v1: employeeAnnouncementContract,
  };
  const excluded = [
    'get_admin_realtime_token_capabilities',
    'get_admin_staff_event_channels_v1',
    'portal_evidence_authorization_v1',
  ];
  const preflights: string[] = [];
  const routes = Object.entries(contracts)
    .filter(([name]) => !excluded.includes(name))
    .map(([name, c]) => {
      const target = routeTarget(name);
      const signature = `${target}(${c.types.join(',')})`;
      const reviewed = definitions.find(
        (d) => d.signature.replaceAll(' ', '') === signature.replaceAll(' ', ''),
      );
      if (!reviewed) throw Error(`Missing reviewed route: ${target}`);
      preflights.push(`do $preflight$begin
 if md5(pg_get_functiondef(${quote(signature)}::regprocedure))<>${quote(md5(reviewed.definition))} then
  raise exception 'Reviewed staging route changed: %',${quote(signature)};end if;
end$preflight$;`);
      return `(${quote(name)},${quote(signature)}::regprocedure,
      ${textArray(c.fields)},${textArray(c.types)},${quote(JSON.stringify(c.defaults))}::jsonb)`;
    });
  const template = readFileSync(
    new URL('../supabase/overlays/admin_development_v1.sql', import.meta.url),
    'utf8',
  );
  return template.replace(
    '-- DOJI_DEVELOPMENT_MANIFEST',
    () =>
      `${preflights.join('\n')}\n${patches.join('\n')}\ninsert into admin_development_private.routes values\n${routes.join(',\n')};`,
  );
}
