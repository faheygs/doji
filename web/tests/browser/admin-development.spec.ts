import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stagingDevelopment } from '../../apps/admin/vite.staging.config';
import { createDevelopmentProxy } from '../../apps/admin/dev/development-proxy';
import { healthFixture } from '../health-fixture';
import {
  createDevelopmentGateway,
  developmentEndpoint,
} from '../../../infra/portal-identity/admin-development.mts';
import { createCleanRoom } from '../../../scripts/database/clean-room.mts';
import {
  installDevelopmentBase,
  developmentDefinitions,
  developmentRealmSql,
  provisionDevelopmentFixture,
  developmentFixtureId as id,
  developmentFixtureToken as token,
} from '../../../scripts/database/admin-development-fixture.mts';
import { buildAdminDevelopmentSql } from '../../../scripts/build-admin-development-sql.mts';
import { source } from '../../../scripts/database/integration.mts';
import type { BrowserRealtimeSdk } from '../../../website/ably-browser.d.mts';

const origin = 'http://127.0.0.1:4313';
const database = process.env.DOJI_ADMIN_DATABASE_E2E === '1';
const room = createCleanRoom();
const sql = (query: string) =>
  room.sql('set role postgres;set search_path=public,extensions;\n' + query);
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
let server: ViteDevServer;
let revoked = false;
const calls: { persona: string | null; name: string }[] = [];
test.beforeAll(async () => {
  test.setTimeout(180000);
  if (database) {
    await room.start();
    await installDevelopmentBase(room);
    const candidate = buildAdminDevelopmentSql(developmentDefinitions(sql));
    sql(developmentRealmSql);
    sql(candidate);
    provisionDevelopmentFixture(sql);
    sql(source('supabase/overlays/admin_development_employees_v2.sql'));
    sql(
      "update admin_development_private.credentials set employee_directory_access=true, expires_at='infinity'",
    );
    sql('update admin_development_private.settings set enabled=true');
    sql(
      'update staff_workflow_private.settings set enabled=true,extended_enabled=true,safety_queue_enabled=true',
    );
  }
  const gateway = createDevelopmentGateway(async (credential, call) => {
    expect(credential).toBe(token);
    calls.push({ persona: call.persona, name: call.name });
    if (database) {
      try {
        return JSON.parse(
          sql(`set session authorization doji_staging_development_login;set role doji_staging_development;
          select admin_development_private.invoke_v1(${quote(createHash('sha256').update(credential).digest('hex'))},
          ${call.persona ? quote(call.persona) : 'null'},${quote(call.name)},${quote(JSON.stringify(call.args))}::jsonb,${quote(call.requestId)});`),
        );
      } catch {
        throw Object.assign(Error('Synthetic database denial'), { status: 401 });
      }
    }
    if (revoked) throw Object.assign(Error('Revoked synthetic token'), { status: 401 });
    if (call.name === 'personas')
      return {
        developer: 'developer-one',
        personas: [1, 2].map((n) => ({ id: id(n), label: 'Test persona ' + n })),
      };
    if (call.name === 'get_admin_portal_session_v3')
      return {
        ok: true,
        result: {
          user_id: call.persona,
          display_name: call.persona === id(1) ? 'Test persona 1' : 'Test persona 2',
          capabilities: {
            operator_manage: call.persona === id(1),
            moderation_read: true,
            operations_read: call.persona === id(1),
          },
        },
      };
    if (call.name === 'get_admin_staff_event_channels_v1')
      return { ok: true, result: ['staff:workflow:moderation'] };
    if (call.name === 'portal_platform_health_v1') return { ok: true, result: healthFixture() };
    if (call.name === 'get_admin_event_health_history_v1')
      return { ok: true, result: { items: [] } };
    if (call.name === 'portal_realtime_token_v1')
      return {
        ok: true,
        result: {
          keyName: 'eVKl2g.synthetic',
          nonce: 'synthetic',
          mac: 'synthetic',
          capability: '{"staff:workflow:moderation":["subscribe"]}',
          timestamp: Date.now(),
        },
      };
    return { ok: false, code: '42501' };
  });
  const proxy = createDevelopmentProxy(token, async (input, options) => {
    expect(String(input)).toBe(developmentEndpoint);
    return gateway(new Request(input, options));
  });
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../apps/admin', import.meta.url)),
    mode: 'staging-local',
    envDir: false,
    logLevel: 'error',
    plugins: [stagingDevelopment(fetch, proxy), react()],
    server: { host: '127.0.0.1', port: 4313, strictPort: true, cors: false },
  });
  await server.listen();
});
test.afterAll(async () => {
  await server?.close();
  if (database) room.stop();
});

test(`local persona flow, reload, switching, writes and revocation (${database ? 'real offline PostgreSQL' : 'synthetic gateway'})`, async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const external: string[] = [];
  let selections = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/dev/select' && request.method() === 'POST')
      selections++;
  });
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.addInitScript(() => {
    class SyntheticRealtime {
      changed?: (change: { current: string }) => void;
      constructor(
        private options: {
          authCallback(params: object, callback: (error: unknown, token: unknown) => void): void;
        },
      ) {}
      channels = { get: () => ({ subscribe: async () => {}, unsubscribe: () => {} }) };
      connection = {
        on: (handler: (change: { current: string }) => void) => {
          this.changed = handler;
        },
      };
      connect() {
        this.options.authCallback({}, (error, token) => {
          if (!error && token) this.changed?.({ current: 'connected' });
        });
      }
      close() {
        delete this.changed;
      }
    }
    window.Ably = { Realtime: SyntheticRealtime } as unknown as BrowserRealtimeSdk;
  });
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(origin);
  await expect(page.getByRole('dialog', { name: 'Impersonate user' })).toBeVisible();
  await page.getByLabel('User', { exact: true }).click();
  await page.getByRole('option', { name: /^Test persona 1(?: ·|$)/ }).click();
  await page.getByRole('button', { name: 'Impersonate User', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Test persona 1.' })).toBeVisible();
  await expect(page.getByRole('note', { name: 'Staging environment' })).toHaveText('DOJI STAGE');
  await expect(page.getByRole('note')).toHaveCSS('background-color', 'rgb(251, 192, 45)');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Authenticator code')).toHaveCount(0);
  if (!database) {
    await expect(page.getByText('Queue updates: connected', { exact: true })).toBeVisible();
    expect(calls.some((c) => c.name === 'portal_realtime_token_v1')).toBe(true);
    await page.getByRole('link', { name: 'Platform health', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Backend & cleanup' })).toBeVisible();
    await expect.poll(() => calls.some((c) => c.name === 'portal_platform_health_v1')).toBe(true);
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back, Test persona 1.' })).toBeVisible();
  if (database) {
    await expect(page.getByText('No overdue or unassigned items in this snapshot.')).toBeVisible();
    await expect(page.getByText('Attention items could not be loaded.')).toHaveCount(0);
    const write = await page.evaluate(async () => {
      const { csrf } = await (await fetch('/api/dev/personas')).json();
      const args = {
        p_action: 'save_draft',
        p_id: null,
        p_version: null,
        p_request_id: crypto.randomUUID(),
        p_input: {
          title: 'Browser staging draft',
          body: 'Synthetic fixture only',
          starts_at: '2030-01-01T00:00:00Z',
          ends_at: '2030-01-02T00:00:00Z',
          priority: 0,
          max_impressions_per_user: 1,
          min_hours_between_impressions: 24,
        },
      };
      const options = {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-doji-csrf': csrf },
        body: JSON.stringify({ name: 'admin_announcement_compose_v1', args }),
      };
      const first = await fetch('/api/dev/rpc', options);
      const second = await fetch('/api/dev/rpc', options);
      return { status: first.status, replay: await second.json() };
    });
    expect(write.status).toBe(200);
    expect(write.replay.replayed).toBe(true);
    expect(sql('select count(*) from public.app_announcements')).toBe('1');
    expect(
      sql(
        "select count(*)>0 from admin_development_private.audit where developer='developer-one' and persona_id='" +
          id(1) +
          "' and operation='admin_announcement_compose_v1' and outcome='allowed'",
      ),
    ).toBe('t');
  }
  const cookies = await page.context().cookies();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]?.httpOnly).toBe(true);
  expect(cookies[0]?.value).not.toBe(token);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await otherPage.goto(origin);
  await expect(otherPage.getByRole('dialog', { name: 'Impersonate user' })).toBeVisible();
  await other.close();
  const before = await page.evaluate(
    async () => (await (await fetch('/api/dev/personas')).json()).csrf,
  );
  const priorSelections = selections;
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Impersonate user' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Welcome back, Test persona 1.' })).toBeVisible();
  expect(selections).toBe(priorSelections);
  await page.evaluate(() => {
    document.documentElement.dataset.previousUser = 'present';
  });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Impersonate user' }).click();
  await page.getByLabel('User', { exact: true }).click();
  await page.getByRole('option', { name: /^Test persona 2(?: ·|$)/ }).click();
  await page.getByRole('button', { name: 'Impersonate User', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Test persona 2.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.previousUser)).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Welcome back, Test persona 1.' })).toHaveCount(0);
  expect(
    await page.evaluate(
      async (csrf) =>
        (await fetch('/api/dev/session', { headers: { 'x-doji-csrf': csrf } })).status,
      before,
    ),
  ).toBe(401);
  await expect(page.getByRole('link', { name: 'Team & access', exact: true })).toHaveCount(0);
  if (database) sql('update admin_development_private.credentials set enabled=false');
  else revoked = true;
  await page.reload();
  await expect(
    page.getByText('Development access expired or was revoked. Ask for a new staging credential.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back, Test persona 2.' })).toHaveCount(0);
  expect(external).toEqual([]);
  expect(calls.some((c) => c.name === 'get_admin_portal_session_v3')).toBe(true);
});
