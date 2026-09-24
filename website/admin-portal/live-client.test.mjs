import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./live-client.js', import.meta.url), 'utf8');

function jwt(aal) {
  const payload = Buffer.from(JSON.stringify({ aal })).toString('base64url');
  return `header.${payload}.signature`;
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body == null ? '' : JSON.stringify(body); },
  };
}

function makeClient(responder) {
  const values = new Map();
  const sandbox = {
    atob(value) { return Buffer.from(value, 'base64').toString('utf8'); },
    fetch: responder,
    sessionStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
    },
    window: {},
  };
  vm.runInNewContext(source, sandbox);
  return {
    client: sandbox.window.DojiAdminPortalClient.create({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'public-anon-key',
      apiBaseUrl: 'https://api.example.com',
    }),
    values,
  };
}

{
  const calls = [];
  const { client, values } = makeClient(async (url, options = {}) => {
    calls.push({ url, method: options.method, body: options.body });
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal1'),
        refresh_token: 'refresh-aal1',
        expires_in: 3600,
        user: { id: 'operator-1', factors: [] },
      });
    }
    if (url.endsWith('/auth/v1/factors')) {
      return jsonResponse({
        id: 'factor-1',
        type: 'totp',
        totp: { qr_code: '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', secret: 'SETUPSECRET' },
      });
    }
    if (url.endsWith('/auth/v1/factors/factor-1/challenge')) return jsonResponse({ id: 'challenge-1' });
    if (url.endsWith('/auth/v1/factors/factor-1/verify')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'refresh-aal2',
        expires_in: 3600,
        user: { id: 'operator-1' },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const signIn = await client.signIn('operator@example.com', 'password');
  assert.equal(signIn.requiresEnrollment, true);
  assert.equal(client.hasSession(), false);

  const enrollment = await client.enrollTotp();
  assert.equal(enrollment.secret, 'SETUPSECRET');
  assert.match(enrollment.qrCode, /^data:image\/svg\+xml;utf-8,<\?xml/);
  const enrollBody = JSON.parse(calls.find((call) => call.url.endsWith('/auth/v1/factors')).body);
  assert.equal(enrollBody.friendly_name, 'Doji Admin');
  assert.equal(enrollBody.issuer, 'Doji Admin');

  await client.verifyTotpEnrollment('123456');
  assert.equal(client.hasSession(), true);
  assert.match(values.get('doji-admin-session-v1'), /refresh-aal2/);
  assert.equal(calls.filter((call) => call.url.endsWith('/challenge')).length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith('/verify')).length, 1);
}

{
  const { client } = makeClient(async (url) => {
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal1'),
        refresh_token: 'returning-refresh',
        expires_in: 3600,
        user: { id: 'operator-2', factors: [{ id: 'factor-2', factor_type: 'totp', status: 'verified' }] },
      });
    }
    if (url.endsWith('/auth/v1/factors/factor-2/challenge')) return jsonResponse({ id: 'challenge-2' });
    if (url.endsWith('/auth/v1/factors/factor-2/verify')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'returning-aal2',
        expires_in: 3600,
        user: { id: 'operator-2' },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const signIn = await client.signIn('returning@example.com', 'password');
  assert.equal(signIn.requiresChallenge, true);
  assert.equal(signIn.method, 'totp');
  await client.verifyPendingChallenge('654321');
  assert.equal(client.hasSession(), true);
}

{
  const { client } = makeClient(async (url) => {
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal1'),
        refresh_token: 'incomplete-refresh',
        expires_in: 3600,
        user: { id: 'operator-3', factors: [] },
      });
    }
    if (url.endsWith('/auth/v1/factors')) {
      return jsonResponse({ id: 'factor-3', type: 'totp', totp: { qr_code: '<svg></svg>' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await client.signIn('incomplete@example.com', 'password');
  await assert.rejects(client.enrollTotp(), /setup key/);
}

{
  const calls = [];
  const { client } = makeClient(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'command-refresh',
        expires_in: 3600,
        user: { id: 'operator-4' },
      });
    }
    if (url.includes('/portal/admin/report-case')) return jsonResponse({ id: 'report-1' });
    if (url.includes('/portal/admin/appeals')) return jsonResponse([{ id: 'appeal-1' }]);
    if (url.endsWith('/portal/admin/report-triage')) return jsonResponse({ report_id: 'report-1' });
    if (url.endsWith('/portal/admin/report-decision')) return jsonResponse({ report_id: 'report-1', status: 'dismissed' });
    if (url.endsWith('/portal/admin/appeal-decision')) return jsonResponse({ appeal_id: 'appeal-1', status: 'reversed' });
    if (url.includes('/storage/v1/object/sign/post-media/')) return jsonResponse({ signedURL: '/storage/v1/object/sign/post-media/path?token=signed' });
    throw new Error(`Unexpected request: ${url}`);
  });

  const signIn = await client.signIn('operator@example.com', 'password');
  assert.equal(signIn.authenticated, true);
  await client.reportCase('report-1');
  await client.appeals(20);
  await client.triageReport({ reportId: 'report-1', action: 'claim', priority: null, note: null, idempotencyKey: 'triage-key-123456' });
  await client.decideReport({ reportId: 'report-1', action: 'no_violation', policyCode: 'no_violation', severity: 'none', reason: 'No violation found.', userNotice: 'We found no violation.', idempotencyKey: 'decision-key-1234' });
  await client.decideAppeal({ appealId: 'appeal-1', outcome: 'reverse', reason: 'The original decision was incorrect.', idempotencyKey: 'appeal-key-123456' });
  const signed = await client.signEvidence('post-media', 'user/report/photo.jpg');
  assert.match(signed, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign\//);

  const triageCall = calls.find((call) => call.url.endsWith('/portal/admin/report-triage'));
  assert.equal(triageCall.method, 'POST');
  assert.deepEqual(JSON.parse(triageCall.body), {
    reportId: 'report-1', action: 'claim', priority: null, note: null, idempotencyKey: 'triage-key-123456',
  });
  const decisionCall = calls.find((call) => call.url.endsWith('/portal/admin/report-decision'));
  assert.equal(decisionCall.method, 'POST');
  assert.equal(JSON.parse(decisionCall.body).reason, 'No violation found.');
  assert.equal(JSON.parse(decisionCall.body).policyCode, 'no_violation');
  const appealCall = calls.find((call) => call.url.endsWith('/portal/admin/appeal-decision'));
  assert.equal(JSON.parse(appealCall.body).outcome, 'reverse');
}

console.log('Admin MFA, report read, triage, classified enforcement, appeals, and evidence-signing tests passed.');
