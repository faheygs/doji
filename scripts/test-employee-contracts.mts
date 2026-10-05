import test from 'node:test';
import assert from 'node:assert/strict';
import {
  employeeActor,
  employeeFlow,
  employeeSession,
} from '../infra/portal-identity-candidate/employee-http-state.mts';
import { createEmployeeResources } from '../infra/portal-identity-candidate/employee-resources.mts';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity-candidate/employee-application-adapter.mts';
import type {
  EmployeeActor,
  EmployeeApplication,
  PortalExecute,
} from '../infra/portal-identity-candidate/employee-contracts.mts';

const actor: EmployeeActor = {
  realm: 'employee',
  mfaVerified: true,
  issuer: 'https://api.workos.com/user_management/client_test',
  audience: 'client_test',
  subject: 'user_test',
  sessionId: 'session_test',
  expiresAtSeconds: 2000000000,
};
const grant = {
  subject: actor.subject,
  accessToken: 'test-access',
  refreshToken: 'test-refresh',
  mfaReceipt: 'test-receipt',
  identity: actor,
};
const session = { grant, actor, csrf: 'test-csrf', created: 1234, touched: 1235 };
const flow = { pending: 'test-pending', csrf: 'test-csrf', expires: 4567 };

test('sealed employee state has explicit typed contracts without cross-realm coercion', () => {
  assert.deepEqual(employeeActor(actor), actor);
  assert.deepEqual(employeeFlow(flow), flow);
  assert.deepEqual(employeeSession(session), session);
});
for (const value of [null, [], 'employee', 42, false]) {
  test(`non-object sealed state is denied: ${JSON.stringify(value)}`, () => {
    assert.throws(() => employeeActor(value));
    assert.throws(() => employeeFlow(value));
    assert.throws(() => employeeSession(value));
  });
}
for (const [field, value] of Object.entries({
  realm: 'business',
  mfaVerified: false,
  issuer: 1,
  audience: null,
  subject: false,
  sessionId: [],
  expiresAtSeconds: '2000000000',
})) {
  test(`employee state rejects invalid ${field}`, () => {
    const invalid = { ...actor, [field]: value };
    assert.throws(() => employeeActor(invalid));
    assert.throws(() => employeeSession({ ...session, actor: invalid }));
  });
}
for (const field of ['pending', 'csrf', 'expires']) {
  test(`login flow rejects missing ${field}`, () =>
    assert.throws(() => employeeFlow({ ...flow, [field]: undefined })));
}
for (const field of ['grant', 'csrf', 'created', 'touched']) {
  test(`session rejects missing ${field}`, () =>
    assert.throws(() => employeeSession({ ...session, [field]: undefined })));
}
for (const field of ['subject', 'accessToken', 'refreshToken', 'mfaReceipt']) {
  test(`session grant rejects missing ${field}`, () =>
    assert.throws(() => employeeSession({ ...session, grant: { ...grant, [field]: undefined } })));
}
test('database boundary does not trust malformed authorization responses', async () => {
  const application: EmployeeApplication = {
    authorize: async () => null,
    command: async () => null,
  };
  const resources = createEmployeeResources(application, {
    storageOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
    signStorage: async () => {
      throw Error('must not sign');
    },
    signRealtime: async () => {
      throw Error('must not sign');
    },
  });
  for (const name of ['portal_sign_evidence_v1', 'portal_realtime_token_v1']) {
    await assert.rejects(
      resources.command(
        actor,
        {
          name,
          args:
            name === 'portal_sign_evidence_v1' ? { bucket: 'post-media', path: 'test/object' } : {},
        },
        AbortSignal.timeout(1000),
      ),
    );
  }
});
test('compiler rejects cross-realm actors, unsafe SQL values and untyped commands', () => {
  const execute: PortalExecute = async () => null;
  const application = createEmployeeApplicationAdapter(execute);
  const check = () => {
    // @ts-expect-error Member or business credentials cannot become an employee actor.
    application.authorize({ ...actor, realm: 'business' }, AbortSignal.timeout(1000));
    // @ts-expect-error MFA must be verified before entering an employee application contract.
    application.authorize({ ...actor, mfaVerified: false }, AbortSignal.timeout(1000));
    // @ts-expect-error SQL parameters must be scalar bound values, never raw objects.
    execute('role', 'query', [{}], AbortSignal.timeout(1000));
    // @ts-expect-error Commands require a named operation and object arguments.
    application.command(actor, { name: 'test', args: [] }, AbortSignal.timeout(1000));
  };
  assert.equal(typeof check, 'function');
});
