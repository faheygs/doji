import { expect } from '../../coverage-fixture.mts';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const testRoot = resolve(import.meta.dirname, '../../../test-results');
const root = process.env.DOJI_BUSINESS_TEST_ARTIFACT
  ? resolve(process.env.DOJI_BUSINESS_TEST_ARTIFACT)
  : resolve(testRoot, 'coverage/current/business-identity-site');
if (!root.startsWith(testRoot + sep)) throw Error('Local business test artifact required');
export const origin = 'https://business.dojipro.com';
export const details = {
  legal_name: 'Example LLC',
  brand_name: 'Example',
  website: 'https://example.test',
  country: 'US',
  business_address: '123 Example Street',
  representative_name: 'Example Owner',
  representative_role: 'Owner',
  category: 'Technology',
  purpose: 'A future campaign',
};
export async function setup(
  page: Page,
  options: {
    signedIn?: boolean;
    status?: string;
    config?: string;
    sessionError?: boolean;
    readError?: boolean;
    conflict?: boolean;
    logoutError?: boolean;
    security?: boolean;
    empty?: boolean;
    authError?: boolean;
    missingControl?: boolean;
    enrollMfa?: boolean;
    invalidMfa?: boolean;
    applicationInvalid?: boolean;
    response?: string;
  } = {},
) {
  let assurance = 'aal1';
  let revision = 1,
    state = options.status || 'draft';
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let draft = { ...details };
  let exists = !options.empty;
  const application = () => ({
    id: '12345678-1234-4234-8234-123456789012',
    revision,
    state,
    details: draft,
    submitted_at: state === 'draft' ? null : '2026-10-05T20:00:00Z',
    response:
      options.response ??
      (state === 'changes_requested' ? 'Please clarify your business purpose.' : ''),
    history:
      state === 'draft'
        ? []
        : [{ action: 'submit', occurred_at: '2026-10-05T20:00:00Z', response: '' }],
  });
  await page.addInitScript((security) => {
    window.turnstile = {
      render(_node, config) {
        if (security) config.callback('synthetic-proof');
        return 'fixture';
      },
      remove() {},
      reset() {},
    };
  }, options.security !== false);
  await page.route(origin + '/**', async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      const body = r.method() === 'POST' ? (r.postDataJSON() as Record<string, unknown>) : {};
      calls.push({ path: url.pathname, body });
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
      if (url.pathname === '/api/session')
        return options.sessionError
          ? reply({}, 503)
          : options.signedIn
            ? reply({ signedIn: true, csrf: 'x'.repeat(43), assurance })
            : reply({}, 401);
      if (url.pathname === '/auth/start')
        return options.authError
          ? reply({}, 503)
          : reply({
              authorizationUrl:
                'https://api.workos.com/user_management/authorize?state=synthetic-state&code_challenge=synthetic-pkce&screen_hint=' +
                (body.signup ? 'sign-up' : 'sign-in') +
                '&redirect_uri=' +
                encodeURIComponent(origin + '/auth/callback'),
            });
      if (url.pathname === '/auth/logout')
        return options.logoutError
          ? reply({}, 503)
          : reply({ signedIn: false, remoteConfirmed: true });
      if (url.pathname === '/auth/mfa/prepare') {
        expect(r.headers()['x-doji-csrf']).toBe('x'.repeat(43));
        if (options.enrollMfa && !body.enroll) return reply({ enrollmentRequired: true });
        return reply({
          challengeReady: true,
          ...(body.enroll ? { enrollmentSecret: 'ABCDEFGHIJKLMNOP' } : {}),
        });
      }
      if (url.pathname === '/auth/mfa/complete') {
        expect(r.headers()['x-doji-csrf']).toBe('x'.repeat(43));
        if (options.invalidMfa) return reply({}, 400);
        assurance = 'aal2';
        return reply({ assurance });
      }
      if (url.pathname === '/api/workspace')
        return assurance === 'aal2' && state === 'approved'
          ? reply({
              organization_id: 'synthetic-org',
              brand_name: 'Example',
              role: 'owner',
              campaigns_enabled: false,
              billing_enabled: false,
            })
          : reply({}, 403);
      if (url.pathname === '/api/application') {
        if (r.method() === 'GET')
          return options.readError ? reply({}, 503) : !exists ? reply(null) : reply(application());
        expect(r.headers()['x-doji-csrf']).toBe('x'.repeat(43));
        if (options.conflict) {
          options.conflict = false;
          revision++;
          return reply({}, 409);
        }
        draft = body.p_details as typeof details;
        if (options.applicationInvalid) return reply({}, 400);
        if (body.p_action === 'submit' && !draft.country)
          return reply({ message: 'Complete all application fields' }, 400);
        if (body.p_action === 'submit') state = 'pending';
        exists = true;
        revision++;
        return reply({ application: application() });
      }
      return reply({}, 404);
    }
    const path = resolve(root, '.' + url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
    if (!path.startsWith(root + sep)) return route.abort();
    try {
      let body = await readFile(path);
      if (options.missingControl && url.pathname.endsWith('/application/'))
        body = Buffer.from(body.toString().replace('id="businessTerms"', 'id="missingTerms"'));
      if (options.config && url.pathname.endsWith('/config.js')) body = Buffer.from(options.config);
      const contentType =
        (
          {
            '.js': 'text/javascript',
            '.html': 'text/html',
            '.css': 'text/css',
            '.png': 'image/png',
          } as Record<string, string>
        )[extname(path)] || 'application/octet-stream';
      const csp = (await readFile(resolve(root, '_headers'), 'utf8'))
        .split('\n')
        .find((line) => line.includes('Content-Security-Policy:'))!
        .split('Content-Security-Policy:')[1]!
        .trim();
      return route.fulfill({ body, contentType, headers: { 'content-security-policy': csp } });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  // This is a synthetic navigation target; no provider request leaves this fixture.
  await page.route('https://api.workos.com/**', async (route) => {
    calls.push({ path: 'hosted-navigation', body: { url: route.request().url() } });
    // A 204 lets the attempted top-level navigation complete without replacing
    // the test document, so its post-auth coverage can be collected reliably.
    return route.fulfill({ status: 204 });
  });
  return calls;
}
