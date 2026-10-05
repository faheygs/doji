import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeAdmission } from '../infra/portal-identity-candidate/employee-admission.mts';
const config = {
  realm: 'employee' as const,
  origin: 'https://admin.dojipro.com',
  clientId: 'client_test',
  admissionKey: 'ab'.repeat(32),
};
test('admission stores only realm-scoped HMACs, not plaintext email or IP', async () => {
  const calls: Parameters<Parameters<typeof createEmployeeAdmission>[1]>[] = [];
  const fn = createEmployeeAdmission(
    config,
    async (...args) => {
      calls.push(args);
      return true;
    },
    '192.0.2.3',
  );
  assert.equal(
    await fn({ email: ' Owner@Example.Test ', signal: AbortSignal.timeout(1000) }),
    true,
  );
  await fn({ email: 'owner@example.test', signal: AbortSignal.timeout(1000) });
  const first = calls[0],
    second = calls[1];
  assert.ok(first && second);
  assert.deepEqual(first[2], second[2]);
  assert.ok(first[2].every((v) => /^[a-f0-9]{64}$/.test(v)));
  assert.equal(first[0], 'doji_employee_session');
  assert.doesNotMatch(JSON.stringify(calls), /owner@|192\.0\.2\.3/i);
});
test('admission rejects malformed email, invalid proxy IP and wrong realm', async () => {
  const fn = createEmployeeAdmission(config, () => assert.fail(), '192.0.2.3');
  assert.equal(await fn({ email: 'bad', signal: AbortSignal.timeout(1000) }), false);
  assert.throws(() => createEmployeeAdmission(config, async () => {}, 'forged'));
  assert.throws(() =>
    // Deliberately cross the static boundary to exercise runtime rejection.
    Reflect.apply(createEmployeeAdmission, undefined, [
      { ...config, realm: 'business' },
      async () => {},
      '192.0.2.3',
    ]),
  );
});
test('database capacity/denial is not bypassed', async () => {
  for (const result of [false, null, { allowed: true }]) {
    const fn = createEmployeeAdmission(config, async () => result, '192.0.2.3');
    assert.equal(
      await fn({ email: 'owner@example.test', signal: AbortSignal.timeout(1000) }),
      false,
    );
  }
});
