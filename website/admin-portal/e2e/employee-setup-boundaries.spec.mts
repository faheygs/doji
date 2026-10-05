import type { Page,Route } from "@playwright/test";
interface SetupCall {path:string;method:string;body:string|null;headers:Record<string,string>;url:string}
interface SetupOptions {
  portalEnabled?:boolean;session?:unknown;access?:string;finalAccess?:string;verified?:unknown;enrollment?:unknown;
  handler?(route:Route,path:string,calls:SetupCall[]):Promise<boolean|void>;
}
import { expect, test } from '../../coverage-fixture.mts';

// Exercise the retained setup UI, not live WorkOS/member authentication.
// Only synthetic sessions are used; the coverage fixture blocks external hosts.
const token = (claims = {}) =>
  `fixture.${Buffer.from(JSON.stringify({ aal: 'aal2', role: 'doji_employee', ...claims })).toString('base64url')}.fixture`;
const factor = { id: 'work/factor', type: 'totp', status: 'verified' };
const session = (overrides = {}) => ({
  access_token: token({ aal: 'aal1' }),
  user: { role: 'doji_employee', app_metadata: { account_type: 'employee' }, factors: [factor] },
  ...overrides,
});
const json = (route:Route, body:unknown, status = 200) => route.fulfill({ status, json: body });

async function mockSetup(page: Page, options:SetupOptions = {}) {
  const calls:SetupCall[] = [];
  let reads = 0;
  await page.route('**/employee-setup/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.DOJI_EMPLOYEE_SETUP_CONFIG=${JSON.stringify({
        supabaseUrl: 'https://tvixsmqxotuvyjqzmjla.supabase.co',
        supabaseAnonKey: 'synthetic-public-key',
        employeePortalEnabled: options.portalEnabled ?? true,
      })}`,
    }),
  );
  await page.route('https://tvixsmqxotuvyjqzmjla.supabase.co/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push({
      path,
      method: request.method(),
      body: request.postData(),
      headers: request.headers(),
      url: request.url(),
    });
    if (options.handler && (await options.handler(route, path, calls))) return;
    if (path.endsWith('/employee-signin')) return json(route, options.session ?? session());
    if (path.endsWith('/employee-register'))
      return json(route, { message: 'Verification sent.' }, 202);
    if (path.endsWith('/get_employee_registration_status_v1')) {
      reads += 1;
      return json(route, {
        status:
          reads === 1
            ? (options.access ?? 'pending')
            : (options.finalAccess ?? options.access ?? 'pending'),
      });
    }
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (request.method() === 'DELETE') return route.fulfill({ status: 204 });
    if (path.endsWith('/challenge')) return json(route, { id: 'fresh-challenge' });
    if (path.endsWith('/verify'))
      return json(route, options.verified ?? session({ access_token: token() }));
    if (path.endsWith('/factors'))
      return json(
        route,
        options.enrollment ?? {
          id: 'new-factor',
          type: 'totp',
          totp: {
            qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>',
            secret: 'SYNTHETIC-SETUP-KEY',
          },
        },
      );
    throw new Error(`Unexpected setup request: ${request.method()} ${path}`);
  });
  return calls;
}

async function signIn(page: Page) {
  await page.goto('/employee-setup/');
  await page.locator('#setupMode').click();
  await page.locator('#setupEmail').fill('staff@example.test');
  await page.locator('#setupPassword').fill('synthetic-password');
  await page.locator('#setupSubmit').click();
}

async function verify(page: Page) {
  await expect(page.locator('#securityForm')).toBeVisible();
  await page.locator('#setupCode').fill('123456');
  await page.locator('#securitySubmit').click();
}

test('switching account modes preserves email and clears password without any request', async ({
  page,
}) => {
  const calls = await mockSetup(page);
  await page.goto('/employee-setup/');
  await page.locator('#setupEmail').fill('staff@example.test');
  await page.locator('#setupPassword').fill('synthetic-password');
  await page.locator('#setupMode').click();
  await expect(page.locator('#setupPassword')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.locator('#setupPassword')).toHaveValue('');
  await expect(page.locator('#setupName')).not.toHaveAttribute('required');
  await page.locator('#setupMode').click();
  await expect(page.locator('#setupPassword')).toHaveAttribute('autocomplete', 'new-password');
  await expect(page.locator('#setupName')).toHaveAttribute('required', '');
  await expect(page.locator('#setupEmail')).toHaveValue('staff@example.test');
  expect(calls).toEqual([]);
});

test('resend validates the address, then continues from confirmation to sign-in', async ({
  page,
}) => {
  const calls = await mockSetup(page);
  await page.goto('/employee-setup/');
  await page.locator('#setupResend').click();
  expect(calls).toEqual([]);
  await page.locator('#setupEmail').fill('staff@example.test');
  await page.locator('#setupResend').click();
  await expect(page.locator('#setupStatus')).toHaveText('Verification sent.');
  await page.locator('#setupResend').click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls.map((call) => JSON.parse(call.body!))).toEqual([
    { action: 'resend_verification', email: 'staff@example.test' },
    { action: 'resend_verification', email: 'staff@example.test' },
  ]);
  await page.locator('#emailContinue').click();
  await expect(page.locator('#setupEmail')).toHaveValue('staff@example.test');
  await expect(page.locator('#setupSubmit')).toHaveText('Continue securely');
});

for (const [label, body, message] of [
  ['message', { message: 'Not admitted' }, 'Not admitted'],
  ['msg', { msg: 'Invalid credentials' }, 'Invalid credentials'],
  ['description', { error_description: 'Verification required' }, 'Verification required'],
  ['empty', {}, 'Setup could not be completed. Please try again.'],
  ['non-JSON', null, 'Setup could not be completed. Please try again.'],
] as const) {
  test(`sign-in exposes ${label} failure and clears password without authorizing access`, async ({
    page,
  }) => {
    const calls = await mockSetup(page, {
      handler: async (route, path) => {
        if (!path.endsWith('/employee-signin')) return false;
        if (body === null)
          await route.fulfill({ status: 502, contentType: 'text/plain', body: 'Unavailable' });
        else await json(route, body, 403);
        return true;
      },
    });
    await signIn(page);
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.locator('#setupStatus')).toBeFocused();
    await expect(page.locator('#setupPassword')).toHaveValue('');
    await expect(page.locator('#setupForm')).toHaveAttribute('aria-busy', 'false');
    expect(calls).toHaveLength(1);
  });
}

test('registration timeout gives recovery guidance without replaying the registration', async ({
  page,
}) => {
  await mockSetup(page);
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (url, options) =>
      String(url).endsWith('/employee-register')
        ? Promise.reject(new DOMException('Deadline exceeded', 'TimeoutError'))
        : original(url, options);
  });
  await page.goto('/employee-setup/');
  await page.locator('#setupName').fill('Synthetic Employee');
  await page.locator('#setupEmail').fill('staff@example.test');
  await page.locator('#setupPassword').fill('synthetic-password');
  await page.locator('#setupSubmit').click();
  await expect(page.getByRole('alert')).toContainText('The request timed out');
  await expect(page.getByRole('alert')).toContainText('before registering again');
  await expect(page.locator('#setupName')).toBeVisible();
  await expect(page.locator('#setupPassword')).toHaveValue('');
});

for (const [label, value] of [
  ['no token', { user: {} }],
  ['no user', { access_token: 'not-authority' }],
  [
    'member',
    {
      access_token: 'not-authority',
      user: { role: 'authenticated', app_metadata: { account_type: 'member' } },
    },
  ],
  ['missing metadata', { access_token: 'not-authority', user: { role: 'doji_employee' } }],
  [
    'business',
    {
      access_token: 'not-authority',
      user: { role: 'doji_employee', app_metadata: { account_type: 'business' } },
    },
  ],
] as const) {
  test(`rejects ${label} session before employee reads or MFA`, async ({ page }) => {
    const calls = await mockSetup(page, { session: value });
    await signIn(page);
    await expect(page.getByRole('alert')).toHaveText('A separate employee identity is required.');
    expect(calls).toHaveLength(1);
    await expect(page.locator('#securitySetup')).toBeHidden();
  });
}

test('disabled employee releases only its temporary local session', async ({ page }) => {
  const calls = await mockSetup(page, { access: 'disabled' });
  await signIn(page);
  await expect(page.getByRole('alert')).toContainText('Employee access is disabled');
  const logout = calls.find((call) => call.path.endsWith('/logout'))!;
  expect(logout.url).toContain('?scope=local');
  expect(logout.headers.authorization).toBe(`Bearer ${session().access_token}`);
  expect(calls.some((call) => call.path.includes('/factors'))).toBe(false);
});

test('only stale unverified TOTP factors are removed before new enrollment', async ({ page }) => {
  const calls = await mockSetup(page, {
    session: session({
      user: {
        role: 'doji_employee',
        app_metadata: { account_type: 'employee' },
        factors: [
          { id: 'stale/one', factor_type: 'totp', status: 'unverified' },
          { id: 'phone-keep', type: 'phone', status: 'unverified' },
        ],
      },
    }),
  });
  await signIn(page);
  await expect(page.locator('#setupQr')).toBeVisible();
  const deletion = calls.filter((call) => call.method === 'DELETE');
  expect(deletion).toHaveLength(1);
  expect(deletion[0]!.path).toBe('/auth/v1/factors/stale%2Fone');
  expect(deletion[0]!.body).toBeNull();
  expect(calls.filter((call) => call.path.endsWith('/factors'))).toHaveLength(1);
});

for (const enrollment of [
  null,
  {},
  { id: 'f', type: 'phone' },
  { id: 'f', type: 'totp' },
  { id: 'f', type: 'totp', totp: { qr_code: '<svg/>' } },
]) {
  test(`incomplete enrollment ${JSON.stringify(enrollment)} fails closed and releases session`, async ({
    page,
  }) => {
    const calls = await mockSetup(page, {
      session: session({
        user: { role: 'doji_employee', app_metadata: { account_type: 'employee' } },
      }),
      handler: async (route, path) => {
        if (!path.endsWith('/factors')) return false;
        await json(route, enrollment);
        return true;
      },
    });
    await signIn(page);
    await expect(page.getByRole('alert')).toContainText('Authenticator setup was incomplete');
    await expect(page.locator('#setupQr')).not.toHaveAttribute('src');
    expect(calls.filter((call) => call.path.endsWith('/logout'))).toHaveLength(1);
  });
}

for (const enabled of [true, false]) {
  test(`active employee completion respects portal enabled=${enabled}`, async ({ page }) => {
    const calls = await mockSetup(page, { access: 'active', portalEnabled: enabled });
    await signIn(page);
    await verify(page);
    await expect(page.locator('#setupComplete')).toBeVisible();
    await expect(page.locator('#setupDescription')).toHaveText('Your work account is approved.');
    if (enabled) await expect(page.locator('#openEmployeePortal')).toBeVisible();
    else {
      await expect(page.locator('#openEmployeePortal')).toBeHidden();
      await expect(page.locator('#accessDescription')).toContainText('administrator will confirm');
    }
    const verification = calls.find((call) => call.path.endsWith('/verify'))!;
    expect(JSON.parse(verification.body!)).toEqual({
      challenge_id: 'fresh-challenge',
      code: '123456',
    });
    expect(verification.path).toBe('/auth/v1/factors/work%2Ffactor/verify');
    expect(calls.filter((call) => call.path.endsWith('/logout'))).toHaveLength(1);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  });
}

test('revoked access after MFA cannot expose workspace and keeps verified-authenticator guidance', async ({
  page,
}) => {
  await mockSetup(page, { finalAccess: 'disabled' });
  await signIn(page);
  await verify(page);
  await expect(page.getByRole('alert')).toContainText(
    'Authenticator verified, but access status could not be loaded',
  );
  await expect(page.getByRole('alert')).toContainText('Employee access is disabled');
  await expect(page.locator('#setupForm')).toBeVisible();
  await expect(page.locator('#openEmployeePortal')).toBeHidden();
});

for (const [label, verified, message] of [
  [
    'member session',
    session({ user: { role: 'authenticated' } }),
    'Employee verification could not be confirmed',
  ],
  [
    'low assurance',
    session({ access_token: token({ aal: 'aal1' }) }),
    'Authenticator verification did not complete',
  ],
  [
    'wrong JWT role',
    session({ access_token: token({ role: 'authenticated' }) }),
    'Authenticator verification did not complete',
  ],
] as const) {
  test(`${label} verification cannot complete setup`, async ({ page }) => {
    const calls = await mockSetup(page, { verified });
    await signIn(page);
    await verify(page);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.locator('#setupComplete')).toBeHidden();
    await expect(page.locator('#setupCode')).toHaveValue('');
    expect(calls.filter((call) => call.path.includes('registration_status'))).toHaveLength(1);
  });
}

test('invalid submitted code is rejected in JS even when native validation is bypassed', async ({
  page,
}) => {
  const calls = await mockSetup(page);
  await signIn(page);
  await expect(page.locator('#securityForm')).toBeVisible();
  await page.locator('#setupCode').fill('12');
  await page.locator('#securityForm').dispatchEvent('submit');
  await expect(page.getByRole('alert')).toContainText('six-digit authenticator code');
  expect(calls.some((call) => call.path.endsWith('/challenge'))).toBe(false);
});

test('expired setup releases temporary session and never sends a challenge', async ({ page }) => {
  await page.clock.install();
  const calls = await mockSetup(page);
  await signIn(page);
  await expect(page.locator('#securityForm')).toBeVisible();
  await page.clock.fastForward(600001);
  await verify(page);
  await expect(page.getByRole('alert')).toContainText('Your setup session expired');
  expect(calls.some((call) => call.path.endsWith('/challenge'))).toBe(false);
  expect(calls.filter((call) => call.path.endsWith('/logout'))).toHaveLength(1);
  await expect(page.locator('#setupForm')).toBeVisible();
});

test('restart clears QR, password and code even if local logout fails', async ({ page }) => {
  const calls = await mockSetup(page, {
    session: session({
      user: { role: 'doji_employee', app_metadata: { account_type: 'employee' }, factors: [] },
    }),
    handler: async (route, path) => {
      if (!path.endsWith('/logout')) return false;
      await json(route, { message: 'Unavailable' }, 503);
      return true;
    },
  });
  await signIn(page);
  await expect(page.locator('#setupQr')).toBeVisible();
  await page.locator('#setupCode').fill('123456');
  await page.locator('#setupRestart').click();
  await expect(page.locator('#setupForm')).toBeVisible();
  await expect(page.locator('#setupQr')).not.toHaveAttribute('src');
  await expect(page.locator('#setupSecret')).toBeEmpty();
  await expect(page.locator('#setupPassword')).toHaveValue('');
  await expect(page.locator('#setupCode')).toHaveValue('');
  expect(calls.filter((call) => call.path.endsWith('/logout'))).toHaveLength(1);
});

test('duplicate and secondary actions are ignored while sign-in is pending', async ({ page }) => {
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const calls = await mockSetup(page, {
    handler: async (route, path) => {
      if (!path.endsWith('/employee-signin')) return false;
      await gate;
      await json(route, session());
      return true;
    },
  });
  await signIn(page);
  await expect(page.locator('#setupForm')).toHaveAttribute('aria-busy', 'true');
  for (const id of ['setupMode', 'emailContinue', 'setupRestart', 'setupResend']) {
    await page.locator(`#${id}`).dispatchEvent('click');
  }
  await page.locator('#setupForm').dispatchEvent('submit');
  await page.locator('#securityForm').dispatchEvent('submit');
  expect(calls).toHaveLength(1);
  await expect(page.locator('#setupHeading')).toHaveText('Welcome back to work.');
  unblock();
  await expect(page.locator('#securityForm')).toBeVisible();
});

for (const fragment of ['error=denied', 'error_code=expired']) {
  test(`failed email fragment ${fragment} is scrubbed and shown without leaking values`, async ({
    page,
  }) => {
    const calls = await mockSetup(page);
    await page.goto(`/employee-setup/#${fragment}&access_token=synthetic-secret`);
    await expect(page.getByRole('alert')).toContainText('This verification link could not be used');
    expect(new URL(page.url()).hash).toBe('');
    expect(calls).toEqual([]);
    await expect(page.locator('body')).not.toContainText('synthetic-secret');
  });
}

for (const [label, fragment, redirect] of [
  ['no token', '#unrelated=1', false],
  ['malformed token', '#access_token=invalid', false],
  ['member token', `#access_token=${token({ role: 'authenticated' })}`, false],
  ['employee token', `#access_token=${token()}`, true],
] as const) {
  test(`legacy presentation return handles ${label} without persisting authority`, async ({
    page,
  }) => {
    await mockSetup(page);
    await page.route('**/return-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<script src="/employee-setup/return.js"></script><p>Return fixture</p>',
      }),
    );
    await page.goto(`/return-fixture${fragment}`);
    if (redirect) {
      await expect(page).toHaveURL(/\/employee-setup\/$/);
      await expect(page.locator('#setupStatus')).toContainText('Sign in to confirm');
    } else await expect(page.locator('p')).toHaveText('Return fixture');
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  });
}
