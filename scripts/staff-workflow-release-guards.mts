// Fixed additive preview release guards. No member/domain command replacement.
import assert from 'node:assert/strict';
// Supabase redeployment refreshes timestamps on these built-in entries, not values.
// Keep every digest/name/other field and every custom-secret timestamp pinned.
export function assertSecretDigestsUnchanged(
  current: Record<string, unknown>[],
  prior: Record<string, unknown>[],
) {
  const reserved = new Set([
    'SUPABASE_ANON_KEY',
    'SUPABASE_DB_URL',
    'SUPABASE_JWKS',
    'SUPABASE_PUBLISHABLE_KEYS',
    'SUPABASE_SECRET_KEYS',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
  ]);
  const normalized = current.map((item) =>
    reserved.has(String(item.name))
      ? { ...item, updated_at: prior.find((p) => p.name === item.name)?.updated_at }
      : item,
  );
  assert.ok(
    JSON.stringify(normalized) === JSON.stringify(prior),
    'Secret identity/digest or custom-secret metadata changed',
  );
}
export const namespaces =
  "'public','auth','storage','business_private','portal_identity_private','employee_session_private','business_session_private'";
export const contractSelect = `select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text,p.proowner) order by p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in (${namespaces})
 and p.proname not in('get_admin_case_ownership_v1','admin_case_ownership_command_v1','get_admin_owned_work_page_v1','get_admin_staff_work_page_v1','get_admin_staff_event_channels_v1','employee_workflow_rpc_v1')),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p','v','m') and n.nspname in (${namespaces})),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in(${namespaces})),
 'roles',(select jsonb_agg(jsonb_build_array(oid,rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolconfig) order by oid) from pg_roles),
 'memberships',(select jsonb_agg(to_jsonb(m) order by roleid,member,grantor) from pg_auth_members m),
 'settings',jsonb_build_array((select to_jsonb(s) from employee_session_private.settings s),
 (select to_jsonb(s) from portal_identity_private.employee_rpc_settings s),
 (select jsonb_agg(to_jsonb(r) order by realm) from portal_identity_private.realms r),
 (select to_jsonb(s) from business_private.settings s)))`;
export const contractHash = `select md5((${contractSelect})::text)`;
export const windowGuard = `if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes'
 and fires_at+interval '15 minutes'>clock_timestamp() limit 1) then raise exception 'Event window: defer';end if;
 if exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1)
 then raise exception 'Overdue outbox: defer';end if;`;
export const indexStatements = [
  "create index concurrently staff_business_pending_page_idx on business_private.applications(created_at,id) where state='pending';",
  "create index concurrently staff_business_open_page_idx on business_private.applications(created_at,id) where state in ('pending','changes_requested');",
  'create index concurrently staff_intake_open_page_idx on public.safety_removal_cases(received_at,id) where closed_at is null;',
  "create index concurrently staff_privacy_open_page_idx on business_private.privacy_cases(received_at,id) where state not in ('completed','denied');",
];
export const indexNames = [
  'business_private.staff_business_pending_page_idx',
  'business_private.staff_business_open_page_idx',
  'public.staff_intake_open_page_idx',
  'business_private.staff_privacy_open_page_idx',
];
export function body(source: string) {
  return source
    .replaceAll('\r\n', '\n')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
}
export function withoutBlockingIndex(source: string) {
  const exact =
    "create index staff_business_pending_page_idx on business_private.applications(created_at,id)\n where state='pending';";
  if (source.split(exact).length !== 2) throw Error('Expected exact local-only index statement');
  return source.replace(
    exact,
    '-- Existing-table index is installed separately with CONCURRENTLY.',
  );
}
export function guardedInstall(install: string, expectedHash: string) {
  if (!/^[a-f0-9]{32}$/.test(expectedHash)) throw Error('Invalid release fingerprint');
  return `begin;set local lock_timeout='2s';set local statement_timeout='8s';
 do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-staff-workflow-v1',0)) then raise exception 'Concurrent release';end if;
 ${windowGuard}
 if to_regnamespace('staff_workflow_private') is not null then raise exception 'Candidate already exists';end if;
 if (${contractHash})<>'${expectedHash}' then raise exception 'Existing contract drift';end if;
 end$$;
 create temp table staff_release_triggers on commit drop as select oid,pg_get_triggerdef(oid) definition from pg_trigger where not tgisinternal;
 ${install}
 do $$begin
 if (${contractHash})<>'${expectedHash}' then raise exception 'Existing contracts changed';end if;
 if exists(select 1 from staff_release_triggers b left join pg_trigger t on t.oid=b.oid where t.oid is null or b.definition<>pg_get_triggerdef(t.oid)) then raise exception 'Existing trigger changed';end if;
 if (select enabled or extended_enabled or events_enabled from staff_workflow_private.settings where singleton) then raise exception 'Preview gates must remain disabled';end if;
 if (select count(*) from pg_trigger where not tgisinternal and tgfoid in(select p.oid from pg_proc p where p.pronamespace='staff_workflow_private'::regnamespace))<>10 then raise exception 'Expected ten default-off triggers';end if;
 end$$;
 commit;`;
}
