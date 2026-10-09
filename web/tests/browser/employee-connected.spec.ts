import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installOfflineRealtime } from './offline-realtime';

// Every request to this emulated origin is fulfilled offline or denied. No live login.
test('connected candidate preserves employee MFA, authorized queues and logout', async ({
  page,
  request,
}, testInfo) => {
  await installOfflineRealtime(page);
  const actor = '10000000-0000-4000-8000-000000000001';
  const caseId = '20000000-0000-4000-8000-000000000002';
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const external: string[] = [];
  let signedIn = false;
  let moderationAllowed = true;
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://admin.dojipro.com') {
      external.push(url.origin);
      await route.abort();
      return;
    }
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    const session = {
      signedIn: true,
      assurance: 'aal2',
      csrf: 'c'.repeat(43),
      operator: {
        user_id: actor,
        display_name: 'Synthetic employee',
        capabilities: { moderation_read: moderationAllowed, legal_read: false },
      },
    };
    if (url.pathname === '/api/session') {
      await json(signedIn ? session : {}, signedIn ? 200 : 401);
      return;
    }
    if (url.pathname === '/auth/start') {
      await json({ step: 'totp', csrf: 'c'.repeat(43) });
      return;
    }
    if (url.pathname === '/auth/complete') {
      signedIn = true;
      await json(session);
      return;
    }
    if (url.pathname === '/auth/logout') {
      signedIn = false;
      await json({ signedIn: false });
      return;
    }
    if (url.pathname === '/api/rpc') {
      const input = route.request().postDataJSON() as {
        name: string;
        args: Record<string, unknown>;
      };
      calls.push(input);
      if (signedIn && input.name === 'get_admin_staff_event_channels_v1') {
        await json([]);
        return;
      }
      if (
        !signedIn ||
        !['get_admin_staff_work_page_v1', 'get_admin_safety_work_page_v1'].includes(input.name)
      ) {
        await json({}, 403);
        return;
      }
      await json({
        scope: input.args.p_queue ? 'staff_safety_v1' : 'staff_inbox_v1',
        order: 'oldest_first',
        authorized_queues: ['report'],
        next_cursor: null,
        ...(input.args.p_queue ? { queue: input.args.p_queue, closed: false } : {}),
        items: [
          {
            kind: 'report',
            id: caseId,
            key: 'report:' + caseId,
            subject: 'Synthetic connected report',
            at: '2026-10-08T12:00:00Z',
            assigned_to: actor,
            work_state: 'ready',
            due_at: null,
            ownership_model: 'existing_report',
            origin: 'in_app',
            status: 'received',
          },
        ],
      });
      return;
    }
    // Only serve known local candidate assets; never proxy /api or /auth to production.
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      await json({}, 404);
      return;
    }
    const asset = await request.get('http://127.0.0.1:4310' + url.pathname + url.search);
    if (url.pathname === '/connected.html') {
      const html = (await asset.text()).replace(
        '<head>',
        '<head><script>window.DOJI_REACT_ADMIN_CONFIG={independentEmployeeIdentity:true,staffWorkflowEnabled:true};</script>',
      );
      await route.fulfill({ contentType: 'text/html', body: html });
    } else await route.fulfill({ response: asset });
  });
  await page.goto('https://admin.dojipro.com/connected.html');
  await page.getByRole('textbox', { name: 'Work email' }).fill('test@example.com');
  await page.getByLabel('Password', { exact: false }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const code = page.getByRole('textbox', { name: 'Authenticator code' });
  await expect(page.locator('[data-code-slot]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verify and continue' })).toBeDisabled();
  await code.fill('012345');
  await expect(code).toHaveValue('012345');
  await code.press('End');
  await code.press('Backspace');
  await expect(code).toHaveValue('01234');
  await code.press('ControlOrMeta+a');
  await code.press('6');
  await expect(code).toHaveValue('6');
  await code.fill('');
  await code.evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '012-345');
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  });
  await expect(code).toHaveValue('012345');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(code).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('mfa-mobile.png'), fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('mfa-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
  await page.getByRole('link', { name: 'My work', exact: true }).click();
  await expect(page.getByText('Synthetic connected report')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Assignee', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/connected\.html#\/my-work$/);
  await expect(page.getByText('UI preview', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My work', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('link', { name: 'Restricted safety', exact: true })).toHaveCount(0);
  expect(
    calls.find(
      (call) => call.name === 'get_admin_staff_work_page_v1' && call.args.p_filter === 'mine',
    )?.args.p_filter,
  ).toBe('mine');
  await page.getByRole('link', { name: 'Trust & safety', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Trust & safety' })).toBeVisible();
  expect(calls.at(-1)?.args.p_queue).toBe('moderation');
  await expect(page).toHaveURL(/#\/trust-safety$/);
  await expect(page.getByRole('link', { name: 'Trust & safety', exact: true })).toHaveAttribute(
    'href',
    '#/trust-safety',
  );
  await page.reload();
  await expect(page.getByRole('table', { name: 'Trust & safety' })).toBeVisible();
  const beforeDenied = calls.length;
  await page.evaluate(() => {
    location.hash = '/restricted-safety';
  });
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(calls.length).toBe(beforeDenied);
  await expect(page.getByText('Synthetic connected report')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('table', { name: 'Trust & safety' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.locator('#workspace-menu').getByRole('link', { name: 'My work', exact: true }).click();
  await expect(page.locator('#workspace-menu')).not.toBeVisible();
  await expect(page.getByRole('table', { name: 'My work' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('connected-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('connected-desktop.png'), fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  moderationAllowed = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  await expect(page.getByText('Synthetic connected report')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Trust & safety', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Lock and sign out' }).click();
  await expect(page.getByText('Synthetic connected report')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Work email' })).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Synthetic connected report')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Work email' })).toBeVisible();
  expect(external).toEqual([]);
});

test('connected candidate refuses local-origin production access', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (/\/(api|auth)\//.test(request.url())) apiCalls.push(request.url());
  });
  await page.goto('http://127.0.0.1:4310/connected.html');
  await expect(page.getByText(/Connected admin is not configured for this origin/)).toBeVisible();
  expect(apiCalls).toEqual([]);
});
