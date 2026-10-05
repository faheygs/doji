import { test, expect } from '../../coverage-fixture.mts';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { operatorSession } from './fixtures.mts';
import { build } from '../../../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import { present, record } from '../../test-values.mts';
const types: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
test('employee portal enters after MFA without a duplicate session read and still locks', async ({
  page,
}) => {
  // Coverage prepares this fresh, instrumented artifact, not the developer's
  // optional .admin-dist. Never let a stale local build make this test pass.
  const root = resolve('website', process.env.DOJI_BROWSER_COVERAGE === '1'
    ? '.business-admin-qa-20261002' : '.admin-dist');
  await readFile(resolve(root, 'index.html')); // Fail at the missing fixture, not at sign-in.
  const transport = await build({
    stdin: {
      contents:
        "export { createEmployeeBrowserTransport as create } from './employee-browser-transport.mts';",
      resolveDir: resolve('infra/portal-identity-candidate'),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'DojiEmployeeTransport',
    platform: 'browser',
    target: 'es2022',
  });
  let sessions = 0,
    completed = false;
  const calls: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://admin.dojipro.com') return route.abort();
    const path = url.pathname;
    calls.push(path);
    if (path === '/api/session') {
      sessions++;
      return route.fulfill({ status: 401, json: { message: 'Signed out' } });
    }
    if (path === '/auth/start')
      return route.fulfill({ json: { step: 'totp', csrf: 'c'.repeat(43) } });
    if (path === '/auth/complete') {
      completed = true;
      return route.fulfill({
        json: {
          signedIn: true,
          assurance: 'aal2',
          csrf: 's'.repeat(43),
          operator: operatorSession,
        },
      });
    }
    if (path === '/auth/logout') return route.fulfill({ json: { signedIn: false } });
    if (path === '/api/rpc') {
      expect(completed).toBe(true);
      const { name } = record(route.request().postDataJSON());
      if (typeof name !== 'string') throw Error('Missing RPC name');
      return route.fulfill({
        json: name.includes('command_center') ? { metrics: {}, work_items: [] } : {},
      });
    }
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root)) return route.abort();
    try {
      let body = await readFile(file);
      if (/\/admin-app-[^/]+\.js$/.test(path))
        body = Buffer.from(
          present(transport.outputFiles[0]).text +
            '\n' +
            body
              .toString()
              .replace(
                '"independentEmployeeIdentity": false',
                '"independentEmployeeIdentity": true',
              ),
        );
      return route.fulfill({
        body,
        contentType: types[extname(file)] || 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://admin.dojipro.com/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.getByLabel('Operator email').fill('employee@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#adminMfaChallengeForm')).toBeVisible();
  await page.locator('#adminChallengeCode').fill('123456');
  await page.locator('#adminMfaChallengeForm button[type="submit"]').click();
  await expect(page.locator('#portalApp')).toBeVisible();
  expect(sessions).toBe(1); // signed-out restoration only, never after completed MFA
  expect(calls).toContain('/api/rpc');
  await page.getByRole('button', { name: 'Lock session' }).click();
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect.poll(() => calls.includes('/auth/logout')).toBe(true);
});
