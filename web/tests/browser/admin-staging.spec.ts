import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { stagingDevelopment } from '../../apps/admin/vite.staging.config';

const origin = 'http://127.0.0.1:4313';
const remote = 'https://admin-staging.dojipro.com';
const token = 'a'.repeat(43);
const flow = 'b'.repeat(43);
const csrf = 'c'.repeat(43);
const calls: string[] = [];
let server: ViteDevServer;
let signedOut = false;
function json(value: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(value), { status, headers });
}
const cookie = (name: string, value: string, seconds = 1800) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
const session = {
  signedIn: true,
  assurance: 'aal2',
  csrf,
  operator: {
    user_id: '11111111-1111-4111-8111-111111111111',
    display_name: 'Synthetic staging reviewer',
    capabilities: {},
  },
};

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../apps/admin', import.meta.url)),
    mode: 'staging-local',
    envDir: false,
    logLevel: 'error',
    plugins: [
      stagingDevelopment(async (input, options) => {
        const url = String(input);
        expect(url.startsWith(remote + '/')).toBe(true);
        const path = url.slice(remote.length);
        calls.push(path);
        const headers = new Headers(options?.headers);
        expect(headers.get('origin')).toBe(remote);
        if (path === '/auth/start')
          return json({ step: 'totp', csrf }, 200, [cookie('__Host-doji_employee_login', flow)]);
        if (path === '/auth/complete') {
          expect(headers.get('cookie')).toBe('__Host-doji_employee_login=' + flow);
          expect(headers.get('x-doji-csrf')).toBe(csrf);
          return json(session, 200, [
            cookie('__Host-doji_employee', token),
            cookie('__Host-doji_employee_login', '', 0),
          ]);
        }
        if (path === '/api/session')
          return headers.get('cookie')?.includes(token) && !signedOut
            ? json(session)
            : json({ message: 'Sign in required.' }, 401);
        if (path === '/auth/logout') {
          expect(headers.get('cookie')).toBe('__Host-doji_employee=' + token);
          expect(headers.get('x-doji-csrf')).toBe(csrf);
          signedOut = true;
          return json({ signedIn: false }, 200, [cookie('__Host-doji_employee', '', 0)]);
        }
        if (path === '/api/rpc') return json({ message: 'Synthetic permission denial.' }, 403);
        throw Error('Unexpected external request in local staging acceptance.');
      }),
      react(),
    ],
    server: { host: '127.0.0.1', port: 4313, strictPort: true, cors: false },
  });
  await server.listen();
});
test.afterAll(async () => {
  await server?.close();
});

test('real browser signs in through local relay, requires MFA, isolates sessions and signs out', async ({
  page,
  browser,
}) => {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(origin);
  await expect(
    page.getByRole('note', { name: 'Staging environment' }),
  ).toBeVisible();
  await page.getByLabel('Work email').fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: false }).fill('Synthetic-test-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  expect(calls.filter((path) => path === '/api/rpc')).toHaveLength(0);
  await page.getByLabel('Authenticator code').fill('123456');
  const completed = page.waitForResponse(origin + '/auth/complete');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  expect((await completed).status()).toBe(200);
  const cookies = await page.context().cookies();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]?.name).toBe('doji_admin_staging_dev_4313');
  expect(cookies[0]?.httpOnly).toBe(true);
  expect(cookies[0]?.sameSite).toBe('Strict');
  expect(cookies[0]?.value).not.toBe(token);
  await page.reload();
  expect(await page.evaluate(async () => (await fetch('/api/session')).status)).toBe(200);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await otherPage.goto(origin);
  await expect(otherPage.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await other.close();
  expect(
    await page.evaluate(
      async (value) =>
        (
          await fetch('/auth/logout', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-doji-csrf': value },
            body: '{}',
          })
        ).status,
      csrf,
    ),
  ).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(external).toEqual([]);
});

test('HTTP server rejects hostile hosts/origins without forwarding and serves deep links', async ({
  request,
}) => {
  const count = calls.length;
  for (const headers of [
    { host: 'evil.example' },
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    expect((await request.get(origin + '/api/session', { headers })).status()).toBe(403);
  }
  expect((await request.get(origin + '/api/session')).status()).toBe(403);
  expect(calls).toHaveLength(count);
  const deep = await request.get(origin + '/team', { headers: { accept: 'text/html' } });
  expect(deep.status()).toBe(200);
  expect(await deep.text()).toContain('/dev/main.tsx');
});
