import { expect, test } from '../../coverage-fixture.mjs';

// This static script is packaged in the public fixture, not the legacy admin
// bundle. Completing an invitation must never become sign-in authority.
for (const [path, expected] of [
  ['/identity/setup-complete?code=synthetic#state=synthetic', '/identity/setup-complete'],
  ['/identity/setup-complete/#state=synthetic', '/identity/setup-complete/'],
  ['/identity/setup-complete', '/identity/setup-complete'],
  ['/unrelated?keep=yes#keep', '/unrelated?keep=yes#keep'],
]) {
  test(`independent identity return strips only setup secrets: ${path}`, async ({ page }) => {
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.route(
      (url) => url.pathname === path.split(/[?#]/)[0],
      (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<script src="/identity/setup-return.js"></script><p>Setup completed is not authentication.</p>',
        }),
    );
    await page.goto(path);
    await expect(page.locator('p')).toHaveText('Setup completed is not authentication.');
    const actual = new URL(page.url());
    expect(actual.pathname + actual.search + actual.hash).toBe(expected);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(true);
  });
}
