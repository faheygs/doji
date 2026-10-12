import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const base = 'https://dojipro.com';
const endpoint = 'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/safety-removal';
async function fixture(page: Page, uncertain = false) {
  if (!process.env.DOJI_PUBLIC_PACKAGE)
    throw Error('Set DOJI_PUBLIC_PACKAGE to an exact static package');
  const root = resolve(process.env.DOJI_PUBLIC_PACKAGE);
  const headers = await readFile(resolve(root, '_headers'), 'utf8');
  const calls: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://challenges.cloudflare.com') {
      await route.fulfill({
        contentType: 'text/javascript',
        body: 'const callbacks={};window.turnstile={render:(root,o)=>{callbacks[root]=o.callback;o.callback("offline-proof");return root},reset:id=>callbacks[id]("offline-proof"),remove:()=>{}};',
      });
      return;
    }
    if (url.href === endpoint) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push(body);
      expect(route.request().headers()['cookie']).toBeUndefined();
      expect(route.request().headers()['authorization']).toBeUndefined();
      if (uncertain && calls.length === 1) {
        await route.abort();
        return;
      }
      await route.fulfill({
        json: {
          id: body.id,
          state: body.action === 'submit' ? 'received' : 'reviewing',
          received_at: '2026-10-09T18:00:00Z',
          updated_at: '2026-10-09T19:00:00Z',
          message: 'Synthetic offline response',
        },
      });
      return;
    }
    if (url.origin !== base) {
      external.push(url.origin);
      await route.abort();
      return;
    }
    let path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    if (!path.split('/').pop()?.includes('.')) path += '/index.html';
    let target = resolve(root, '.' + path);
    if (!target.startsWith(root + sep)) throw Error('Invalid asset path');
    let bytes;
    let status = 200;
    try {
      bytes = await readFile(target);
    } catch {
      status = 404;
      target = resolve(root, '404.html');
      bytes = await readFile(target);
    }
    const safety = url.pathname.startsWith('/safety-removal');
    const csp = safety
      ? headers.match(/\/safety-removal\n  Content-Security-Policy: (.+)/)?.[1]
      : headers.match(/Content-Security-Policy: (.+)/)?.[1];
    if (!csp) throw Error('Missing release CSP');
    await route.fulfill({
      status,
      body: bytes,
      contentType: target.endsWith('.html')
        ? 'text/html'
        : target.endsWith('.js')
          ? 'text/javascript'
          : target.endsWith('.css')
            ? 'text/css'
            : target.endsWith('.txt')
              ? 'text/plain'
              : 'image/png',
      headers: { 'content-security-policy': csp },
    });
  });
  return { calls, errors, external };
}
test('public home hydrates under release CSP, has SEO metadata and no preview notice', async ({
  page,
}) => {
  const api = await fixture(page);
  await page.goto(base + '/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ten minutes.');
  await expect(page.getByText('Migration preview', { exact: false })).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', base + '/');
  await page.screenshot({ path: test.info().outputPath('public-home.png'), fullPage: true });
  expect(api.errors).toEqual([]);
  expect(api.calls).toEqual([]);
  expect(api.external).toEqual([]);
});
test('all public documents retain their exact reviewed main content and canonical', async ({
  page,
}) => {
  const api = await fixture(page);
  for (const slug of [
    'privacy',
    'terms',
    'community-guidelines',
    'child-safety',
    'support',
    'delete-account',
    'delete-data',
  ]) {
    const source = await readFile(
      `D:/ChallengeApp/DoIt/test-results/safety-launch-20260929/public/${slug}/index.html`,
      'utf8',
    );
    const oldBody = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    expect(oldBody).toBeTruthy();
    const response = await page.goto(base + '/' + slug + '/');
    const normalizeLinks = (value: string) =>
      value.replaceAll('href="https://dojipro.com/', 'href="/');
    expect(
      normalizeLinks(await response!.text()).includes(normalizeLinks(oldBody!)),
      `${slug}: reviewed content parity`,
    ).toBe(true);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      base + '/' + slug + '/',
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(api.errors).toEqual([]);
  expect(api.calls).toEqual([]);
});
test('safety form preserves taxonomy, stable retry identity, receipt and private status lookup', async ({
  page,
}) => {
  const api = await fixture(page, true);
  await page.goto(base + '/safety-removal/');
  await expect(page.locator('#submitRequest')).toBeEnabled();
  // Exercise the original select contract; enhanced menu keyboard behavior remains unchanged.
  await page.locator('#reason').selectOption('other', { force: true });
  await page.locator('#requestName').fill('Synthetic request');
  await page.locator('#contact').fill('offline@example.com');
  await page.locator('#location').fill('Synthetic offline fixture, no real content');
  await page.locator('#statement').fill('Offline migration test');
  await page.locator('#signature').fill('Synthetic request');
  await page.locator('#declaration').check();
  await page.locator('#submitRequest').click();
  await expect(page.locator('#requestFeedback')).toContainText('response could not be confirmed');
  await page.locator('#submitRequest').click();
  await expect(page.locator('#receiptSection')).toBeVisible();
  expect(api.calls[0]).toEqual(api.calls[1]);
  await expect(page.locator('#receiptSecret')).not.toBeEmpty();
  await page.locator('#checkStatus').click();
  await expect(page.locator('#statusLabel')).toHaveText('Under review');
  await expect(page.locator('#statusMessage')).toHaveText('Synthetic offline response');
  expect(api.calls).toHaveLength(3);
  expect(api.external).toEqual([]);
  expect(api.errors.filter((error) => !error.includes('net::ERR_FAILED'))).toEqual([]);
});
test('safety route remains readable and fits a narrow viewport', async ({ page }) => {
  const api = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/safety-removal/');
  await expect(page.locator('#submitRequest')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('safety-mobile.png'), fullPage: true });
  expect(api.errors).toEqual([]);
});
