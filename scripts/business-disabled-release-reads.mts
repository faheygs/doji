// Bounded read-only release baseline. No credentials or member content are returned.
import assert from 'node:assert/strict';
import { cli, cf, ref, hash } from './prepare-safety-launch.mts';
import { evidenceArray, evidenceRecord, evidenceRows } from './release-evidence.mts';
import type { PagesReleaseProject } from './release-evidence.mts';
export const linkedWorkspace = 'D:/ChallengeApp/DoIt';
export const functions = () =>
  evidenceArray(
    evidenceRecord(cli(['functions', 'list', '--project-ref', ref, '--output-format', 'json']))
      .functions,
  );
export const secrets = () =>
  evidenceArray(
    evidenceRecord(cli(['secrets', 'list', '--project-ref', ref, '--output-format', 'json']))
      .secrets,
  );
export async function pages() {
  const result: Record<string, unknown> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const p = await cf<PagesReleaseProject>(`/pages/projects/${name}`);
    result[name] = {
      id: p.canonical_deployment?.id,
      domains: p.domains,
      functions: p.canonical_deployment?.uses_functions,
    };
  }
  return result;
}
export function database() {
  return evidenceRecord(
    evidenceRows(
      cli([
        'db',
        'query',
        `begin read only;
    set local statement_timeout='5s';
    select jsonb_build_object('at',clock_timestamp(),
      'event_window',exists(select 1 from public.daily_events
        where fires_at<=clock_timestamp()+interval '25 minutes'
        and fires_at+interval '15 minutes'>clock_timestamp() limit 1),
      'next_event',(select min(fires_at) from public.daily_events where fires_at>clock_timestamp()),
      'contracts',(select md5(jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text)
        order by p.oid)::text) from pg_proc p where p.prokind='f'
        and p.pronamespace in('public'::regnamespace,'auth'::regnamespace)),
      'policies',(select md5(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text)
        from pg_policies p where schemaname in('public','auth','storage')),
      'roles',(select md5(jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls)
        order by rolname)::text) from pg_roles),
      'overdue_sample',(select count(*) from (select 1 from public.domain_event_outbox
        where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1000) q)
    ) as state; rollback;`,
        '--linked',
        '--workdir',
        linkedWorkspace,
        '--output-format',
        'json',
      ]),
    )[0]?.state,
  );
}
export async function health() {
  const results = [];
  for (const [url, expected] of [
    ['https://admin.dojipro.com/api/session', 401],
    ['https://admin.dojipro.com/', 200],
    ['https://business.dojipro.com/', 200],
    ['https://business.dojipro.com/business-portal/application/', 200],
    [`https://${ref}.supabase.co/auth/v1/health`, 401],
  ] as const) {
    const started = Date.now();
    const r = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: url.endsWith('/api/session') ? { origin: 'https://admin.dojipro.com' } : {},
    });
    const body = await r.text();
    assert.equal(r.status, expected, `Unexpected public boundary status: ${url}`);
    const location = r.headers.get('location');
    if (url === 'https://business.dojipro.com/')
      assert.equal(location, null);
    results.push({ url, status: r.status, location, ms: Date.now() - started, hash: hash(body) });
  }
  return results;
}
