import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessOwnedGuard } from '../infra/portal-identity/business-owned-guard.mts';
test('business identity admission does not depend on a Node-only Buffer global', () => {
  const guard = createBusinessOwnedGuard(
    {
      enabled: true,
      realm: 'business',
      origin: 'https://business.dojipro.com',
      clientId: 'client_synthetic',
      admissionHmacKey: 'ab'.repeat(32),
    },
    async () => null,
  );
  const expected = guard.identityKey('synthetic@example.com');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Buffer')!;
  try {
    Reflect.deleteProperty(globalThis, 'Buffer');
    assert.equal(guard.identityKey('synthetic@example.com'), expected);
  } finally {
    Object.defineProperty(globalThis, 'Buffer', descriptor);
  }
});
