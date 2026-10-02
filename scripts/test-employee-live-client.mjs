import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile('website/admin-portal/live-client.js', 'utf8');
function fixture() {
  const calls = [];
  let signed = false;
  const operator = {
    user_id: 'synthetic',
    roles: ['operations'],
    capabilities: { operations_read: true },
  };
  const transport = {
    hasSession: () => signed,
    assertSessionFresh() {
      if (!signed) throw Error('locked');
    },
    noteActivity: () => signed,
    request: async (path, options) => {
      calls.push(['request', path, options]);
      if (path.endsWith('/session')) {
        signed = true;
        return operator;
      }
      return {};
    },
    signIn: async (...args) => {
      calls.push(['signIn', ...args]);
      return { requiresChallenge: true };
    },
    enrollTotp: async () => ({ qrCode: 'synthetic', secret: 'synthetic' }),
    verifyPendingChallenge: async (code) => {
      calls.push(['verify', code]);
      signed = true;
    },
    verifyTotpEnrollment: async (code) => {
      calls.push(['enroll', code]);
      signed = true;
    },
    signEvidence: async (...args) => {
      calls.push(['evidence', ...args]);
      return 'signed';
    },
    signOut: async () => {
      calls.push(['logout']);
      signed = false;
    },
    clearSession: () => {
      calls.push(['clear']);
      signed = false;
    },
  };
  const context = vm.createContext({
    window: { DojiEmployeeTransport: { create: () => transport } },
    sessionStorage: {
      getItem() {
        throw Error('Must not read legacy credentials');
      },
      setItem() {
        throw Error('Must not write credentials');
      },
      removeItem() {
        throw Error('Must not change legacy session');
      },
    },
    fetch() {
      throw Error('Must not call Supabase or shared Worker');
    },
    URL,
    AbortSignal,
    Date,
    console,
  });
  vm.runInContext(source, context);
  const client = context.window.DojiAdminPortalClient.create({
    employeeAccountsEnabled: true,
    independentEmployeeIdentity: true,
  });
  return { client, calls, operator };
}
test('existing client delegates auth and restoration without touching old credentials', async () => {
  const f = fixture();
  assert.equal(f.client.hasSession(), false);
  assert.equal((await f.client.signIn('synthetic@example.test', 'test')).requiresChallenge, true);
  await f.client.verifyPendingChallenge('123456');
  assert.equal(f.client.hasSession(), true);
  assert.deepEqual(await f.client.session(), f.operator);
  await f.client.signOut();
  assert.equal(f.client.hasSession(), false);
  assert.equal(f.calls.at(-1)[0], 'logout');
});
test('existing admin screens route through independent transport; signup cannot fall back to Supabase', async () => {
  const f = fixture();
  await f.client.session();
  await f.client.commandCenter(20);
  await f.client.platformHealth();
  await f.client.businessItem('synthetic');
  await f.client.safetyCase('synthetic');
  assert.equal(await f.client.signEvidence('post-media', 'synthetic'), 'signed');
  assert.ok(f.calls.some((c) => c[1] === '/portal/admin/platform-health'));
  await assert.rejects(
    f.client.registerEmployee('Test', 'synthetic@example.test', 'test'),
    /invitation-only/,
  );
  await assert.rejects(f.client.resendEmployeeVerification('synthetic@example.test'), /invitation/);
  f.client.clearSession();
  assert.equal(f.client.hasSession(), false);
});
test('legacy mode remains available, independent mode cannot silently fall back', () => {
  const context = vm.createContext({
    window: {},
    sessionStorage: { getItem: () => null },
    console,
  });
  vm.runInContext(source, context);
  assert.throws(
    () =>
      context.window.DojiAdminPortalClient.create({
        employeeAccountsEnabled: true,
        independentEmployeeIdentity: true,
      }),
    /unavailable/,
  );
  const client = context.window.DojiAdminPortalClient.create({
    employeeAccountsEnabled: true,
    supabaseUrl: 'https://test.invalid',
    supabaseAnonKey: 'public',
    apiBaseUrl: 'https://worker.invalid',
  });
  assert.equal(client.hasSession(), false);
});
