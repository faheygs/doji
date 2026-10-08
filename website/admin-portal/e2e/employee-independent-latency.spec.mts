import { test, expect } from '../../coverage-fixture.mts';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { operatorSession } from './fixtures.mts';
import { build } from '../../../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import { present, record } from '../../test-values.mts';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const types: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
async function installEmployeeJourney(
  page: Page,
  options: {
    restoreGate?: Promise<void>;
    bundleGate?: Promise<void>;
    restoreStatus?: 401 | 503;
    restoreValid?: boolean;
    logoutGate?: Promise<void>;
    rejectLogout?: boolean;
    passwordGate?: Promise<void>;
    rejectCode?: boolean;
    rejectPassword?: boolean;
  } = {},
) {
  // Coverage prepares this fresh, instrumented artifact, not the developer's
  // optional .admin-dist. Never let a stale local build make this test pass.
  const root = process.env.DOJI_ADMIN_AUTH_ARTIFACT
    ? resolve(process.env.DOJI_ADMIN_AUTH_ARTIFACT)
    : resolve(
        'website',
        process.env.DOJI_BROWSER_COVERAGE === '1' ? '.business-admin-qa-20261002' : '.admin-dist',
      );
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
      await options.restoreGate;
      if (options.restoreValid) {
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
      return route.fulfill({
        status: options.restoreStatus || 401,
        json: {
          message:
            options.restoreStatus === 503
              ? 'Session check unavailable. Please sign in.'
              : 'Signed out',
        },
      });
    }
    if (path === '/auth/start') {
      await options.passwordGate;
      if (options.rejectPassword)
        return route.fulfill({
          status: 401,
          json: { message: 'Email or password was not accepted.' },
        });
      return route.fulfill({ json: { step: 'totp', csrf: 'c'.repeat(43) } });
    }
    if (path === '/auth/complete') {
      if (options.rejectCode)
        return route.fulfill({ status: 400, json: { message: 'Code expired' } });
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
    if (path === '/auth/logout') {
      await options.logoutGate;
      // Bound the old bug to two requests instead of leaving a runaway fixture.
      if (options.rejectLogout && calls.filter((p) => p === '/auth/logout').length === 1)
        return route.fulfill({ status: 503, json: { message: 'Synthetic cleanup unavailable' } });
      return route.fulfill({ json: { signedIn: false } });
    }
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
      if (/\/admin-app-[^/]+\.js$/.test(path)) {
        await options.bundleGate;
        body = Buffer.from(
          (body.toString().includes('"independentEmployeeIdentity": true')
            ? ''
            : present(transport.outputFiles[0]).text) +
            '\n' +
            body
              .toString()
              .replace(
                '"independentEmployeeIdentity": false',
                '"independentEmployeeIdentity": true',
              ),
        );
      }
      return route.fulfill({
        body,
        contentType: types[extname(file)] || 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  return { calls, sessionCount: () => sessions };
}

async function signIn(page: Page) {
  await page.goto('https://admin.dojipro.com/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.getByLabel('Operator email').fill('employee@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#adminMfaChallengeForm')).toBeVisible();
}

test('employee portal enters after MFA without a duplicate session read and still locks', async ({
  page,
}) => {
  const { calls, sessionCount } = await installEmployeeJourney(page);
  await signIn(page);
  await expect(page.locator('#adminAuthTitle')).toHaveText('Verify it’s you');
  await expect(page.locator('[data-auth-step][aria-current="step"]')).toContainText('Verify');
  await expect(page.locator('#adminPassword')).toHaveValue('');
  await page.locator('#adminChallengeCode').fill('123456');
  await page.locator('#adminMfaChallengeForm button[type="submit"]').click();
  await expect(page.locator('#portalApp')).toBeVisible();
  expect(sessionCount()).toBe(1); // signed-out restoration only, never after completed MFA
  await expect(page.locator('#adminChallengeCode')).toHaveValue('');
  await expect(page.locator('#portalPageTitle')).toBeFocused();
  expect(calls).toContain('/api/rpc');
  await page.getByRole('button', { name: 'Lock session' }).click();
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect(page.locator('#adminAuthTitle')).toHaveText('Workspace locked');
  await expect(page.locator('#adminAuthDescription')).toContainText('drafts were cleared');
  await expect(page.locator('#adminAuthTitle')).toBeFocused();
  await expect.poll(() => calls.includes('/auth/logout')).toBe(true);
});

test('session restoration does not expose a temporarily unusable password form', async ({
  page,
}) => {
  let release = () => {};
  const restoreGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await installEmployeeJourney(page, { restoreGate });
  await page.goto('https://admin.dojipro.com/');
  await expect(page.locator('#adminAuthTitle')).toHaveText('Opening admin workspace');
  await expect(page.locator('#adminSigninForm')).toBeHidden();
  release();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.locator('#adminAuthTitle')).toHaveText('Admin sign in');
  await expect(page.locator('#adminPassword')).toBeEnabled();
});

test('slow startup never offers a password field that initialization then clears', async ({
  page,
}) => {
  let releaseBundle = () => {};
  const bundleGate = new Promise<void>((resolve) => {
    releaseBundle = resolve;
  });
  await installEmployeeJourney(page, { bundleGate });
  await page.goto('https://admin.dojipro.com/', { waitUntil: 'commit' });
  await expect(page.locator('#adminAuthTitle')).toBeVisible();
  await expect(page.locator('#adminSigninForm')).toBeHidden();
  releaseBundle();
  await expect(page.locator('#adminPassword')).toBeVisible();
  await expect(page.locator('#adminPassword')).toBeEnabled();
  await page.locator('#adminEmail').fill('employee@example.test');
  // Model password-manager assignment without input/change events. Never use a real password.
  await page.locator('#adminPassword').evaluate((input: HTMLInputElement) => {
    input.value = 'synthetic-autofill';
  });
  await page.clock.install();
  await page.clock.fastForward(65000);
  await expect(page.locator('#adminPassword')).toHaveValue('synthetic-autofill');
  await page.locator('#adminPassword').click();
  await expect(page.locator('#adminPassword')).toBeFocused();
  await expect(page.locator('#adminPassword')).toBeEditable();
});

test('a failed session check offers focusable fields and permits a fresh sign-in', async ({
  page,
}) => {
  await installEmployeeJourney(page, { restoreStatus: 503 });
  await signIn(page);
  await expect(page.locator('#adminMfaChallengeForm')).toBeVisible();
  await expect(page.locator('#adminSigninForm')).not.toHaveAttribute('aria-busy');
});

test('restored employees enter the workspace without exposing the credential form', async ({
  page,
}) => {
  let release = () => {};
  const restoreGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await installEmployeeJourney(page, { restoreValid: true, restoreGate });
  await page.goto('https://admin.dojipro.com/');
  await expect(page.locator('#adminAuthTitle')).toHaveText('Opening admin workspace');
  await expect(page.locator('#adminSigninForm')).toBeHidden();
  release();
  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('#adminSigninForm')).toBeHidden();
});

test('explicit lock failure preserves newly entered credentials', async ({ page }) => {
  let release = () => {};
  const logoutGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { calls } = await installEmployeeJourney(page, {
    restoreValid: true,
    logoutGate,
    rejectLogout: true,
  });
  await page.goto('https://admin.dojipro.com/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.getByRole('button', { name: 'Lock session' }).click();
  await expect(page.locator('#adminPassword')).toBeVisible();
  await expect.poll(() => calls.filter((p) => p === '/auth/logout').length).toBe(1);
  await page.locator('#adminPassword').fill('synthetic-new-attempt');
  release();
  await expect(page.locator('#adminSigninStatus')).toContainText('could not be confirmed');
  await expect(page.locator('#adminPassword')).toHaveValue('synthetic-new-attempt');
  expect(calls.filter((p) => p === '/auth/logout')).toHaveLength(1);
});

test('idle expiry cleanup failure cannot clear newly entered credentials', async ({ page }) => {
  let release = () => {};
  const logoutGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { calls } = await installEmployeeJourney(page, {
    restoreValid: true,
    logoutGate,
    rejectLogout: true,
  });
  await page.clock.install();
  await page.goto('https://admin.dojipro.com/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.clock.fastForward(31 * 60 * 1000);
  await expect(page.locator('#adminPassword')).toBeVisible();
  await expect.poll(() => calls.filter((p) => p === '/auth/logout').length).toBe(1);
  await page.locator('#adminPassword').fill('synthetic-new-attempt');
  release();
  await expect(page.locator('#adminSigninStatus')).toContainText('could not be confirmed');
  await expect(page.locator('#adminPassword')).toHaveValue('synthetic-new-attempt');
  expect(calls.filter((p) => p === '/auth/logout')).toHaveLength(1);
  await page.locator('#adminPassword').click();
  await expect(page.locator('#adminPassword')).toBeFocused();
});

test('password is cleared while signing in and the attempt cannot be submitted twice', async ({
  page,
}) => {
  let release = () => {};
  const passwordGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { calls } = await installEmployeeJourney(page, { passwordGate });
  await page.goto('https://admin.dojipro.com/');
  await expect(page.locator('#adminPassword')).toBeEnabled();
  await page.getByLabel('Operator email').fill('employee@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-only');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.locator('#adminPassword')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#adminPassword')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled();
  expect(calls.filter((path) => path === '/auth/start')).toHaveLength(1);
  release();
  await expect(page.locator('#adminMfaChallengeForm')).toBeVisible();
});

test('a rejected one-use MFA flow returns to a fresh sign-in without retaining the code', async ({
  page,
}) => {
  await installEmployeeJourney(page, { rejectCode: true });
  await signIn(page);
  await page.locator('#adminChallengeCode').fill('123456');
  await page.locator('#adminMfaChallengeForm button[type="submit"]').click();
  await expect(page.locator('#adminSigninForm')).toBeVisible();
  await expect(page.locator('#adminSigninStatus')).toContainText('fresh security check');
  await expect(page.locator('#adminChallengeCode')).toHaveValue('');
  await expect(page.locator('#portalApp')).toBeHidden();
});

test('incorrect password keeps actionable feedback after the transport clears its session', async ({
  page,
}) => {
  await installEmployeeJourney(page, { rejectPassword: true });
  await page.goto('https://admin.dojipro.com/');
  await expect(page.locator('#adminPassword')).toBeEnabled();
  await page.getByLabel('Operator email').fill('employee@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-incorrect');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#adminSigninStatus')).toContainText(
    'Email or password was not accepted',
  );
  await expect(page.locator('#adminAuthTitle')).toHaveText('Admin sign in');
  await expect(page.locator('#adminPassword')).toHaveValue('');
  await expect(page.locator('#portalApp')).toBeHidden();
});

test('employee sign-in fits narrow screens in both themes with clear access help', async ({
  page,
}, testInfo) => {
  await installEmployeeJourney(page);
  await page.goto('https://admin.dojipro.com/');
  await expect(page.locator('#adminPassword')).toBeEnabled();
  await page.getByText('Need help getting access?', { exact: true }).click();
  await expect(page.locator('.adminAccessHelp')).toContainText('does not grant access here');
  await page.screenshot({ path: testInfo.outputPath('admin-sign-in-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let theme = 0; theme < 2; theme++) {
    await expect(page.locator('#adminAuthTitle')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const button = await page.locator('#adminPasswordToggle').boundingBox();
    expect(button?.height).toBeGreaterThanOrEqual(40);
    const submit = await page.locator('#adminSigninForm button[type="submit"]').boundingBox();
    expect(present(submit).y + present(submit).height).toBeLessThanOrEqual(844);
    const accessibility = await new AxeBuilder({ page })
      .include('#portalAuth')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`admin-sign-in-mobile-${theme}.png`),
      fullPage: true,
    });
    await page.locator('.authUtility [data-action="toggle-theme"]').click();
  }
});
