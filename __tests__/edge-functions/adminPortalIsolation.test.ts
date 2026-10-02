import { handlePortalRead, portalRouteFor } from '../../infra/doji-orchestrator/src/portal-read';
import { authenticateScaleReadRequest } from '../../infra/doji-orchestrator/src/scale-read-auth';
import fs from 'node:fs';

jest.mock('../../infra/doji-orchestrator/src/scale-read-auth', () => ({
  normalizedSupabaseUrl: (env: { SUPABASE_URL: string }) => env.SUPABASE_URL,
  authenticateScaleReadRequest: jest.fn(),
}));

const env = { SUPABASE_URL: 'https://portal-isolation.test', SUPABASE_ANON_KEY: 'public', OUTBOX_RELAY_SECRET: 'unused' };
const auth = authenticateScaleReadRequest as jest.Mock;
const request = () => new Request('https://api.test/portal/admin/platform-health');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

test('concurrent health reads share a read-only RPC, but reauthorize every caller', async () => {
  auth.mockResolvedValue({ userId: 'operator', token: 'caller-token', aal: 'aal2' });
  let permitted = true;
  const calls: string[] = [];
  global.fetch = jest.fn(async (input) => {
    const url = String(input); calls.push(url);
    if (url.endsWith('/admin_user_has_permission')) return Response.json(permitted);
    if (url.endsWith('/get_admin_operational_health_read_v1')) return Response.json({ healthy: true, checked_at: new Date().toISOString() });
    throw new Error(`Unexpected upstream: ${url}`);
  });
  const results = await Promise.all([handlePortalRead(request(), env), handlePortalRead(request(), env)]);
  expect(results.map((r) => r?.status)).toEqual([200,200]);
  expect(calls.filter((url) => url.endsWith('/get_admin_operational_health_read_v1'))).toHaveLength(1);
  expect(calls.filter((url) => url.endsWith('/admin_user_has_permission'))).toHaveLength(2);
  expect(calls.some((url) => url.includes('/functions/'))).toBe(false);
  permitted = false;
  expect((await handlePortalRead(request(), env))?.status).toBe(403);
  expect(calls.filter((url) => url.endsWith('/get_admin_operational_health_read_v1'))).toHaveLength(1);
});

test('AAL1 cannot reach health reads or cached health', async () => {
  auth.mockResolvedValue({ userId: 'member', token: 'member-token', aal: 'aal1' });
  global.fetch = jest.fn();
  expect((await handlePortalRead(request(), env))?.status).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('server queue validates cursor pairs and supports scoped server filters', () => {
  const url = new URL('https://api.test/portal/admin/work-queue?queue=moderation&filter=mine&search=drugs');
  const route = portalRouteFor(url)!;
  expect(route.rpc).toBe('get_admin_work_queue_page_v1');
  expect(route.args(url, {})).toMatchObject({ p_limit: 25, p_queue: 'moderation', p_filter: 'mine', p_search: 'drugs' });
  url.searchParams.set('afterAt','2026-09-24T00:00:00Z');
  expect(() => route.args(url, {})).toThrow(/Invalid/);
  expect(portalRouteFor(new URL('https://api.test/portal/admin/session'))?.rpc).toBe('get_admin_portal_session_v3');
});

test('isolation migration is additive and changes no member schema, policy or existing function', () => {
  const sql = fs.readFileSync('supabase/migrations/20260926000000_admin_portal_isolated_reads.sql','utf8');
  const statements = sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
  expect(statements).not.toMatch(/\b(create or replace|alter|drop|update|delete|insert|trigger|policy)\b/i);
  expect(statements).not.toContain('service_role');
  expect(sql).toContain("public.admin_user_has_permission('operations.read')");
  const healthSql = fs.readFileSync('supabase/migrations/20260925223000_classify_realtime_delivery_stage.sql','utf8').split('create or replace function public.get_operational_health()')[1].split('$$;')[0];
  expect(healthSql).not.toMatch(/\b(insert|update|delete|perform)\b/i);
});
