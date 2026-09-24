import {
  PUSH_REGISTRATION_RECONCILE_MS,
  canReusePushRegistration,
  pushRegistrationFingerprint,
  pushRegistrationRetryDelay,
  type PushRegistrationFingerprintInput,
} from '../../lib/pushRegistrationPolicy';

const input: PushRegistrationFingerprintInput = {
  installationId: 'installation-1',
  userId: 'user-1',
  nativeToken: 'native-secret-token',
  expoToken: 'expo-secret-token',
  platform: 'android',
  environment: 'production',
  appVersion: '1.0.7',
  nativeBuildNumber: '17',
  releaseChannel: 'production',
  notificationContractVersion: 2,
  pushEnabled: true,
};

describe('push registration policy', () => {
  it('fingerprints every registration identity field without persisting raw tokens', () => {
    const fingerprint = pushRegistrationFingerprint(input);
    expect(fingerprint).toMatch(/^v1:[a-f0-9]{16}$/);
    expect(fingerprint).not.toContain(input.nativeToken);
    expect(pushRegistrationFingerprint({ ...input, nativeToken: 'rotated' })).not.toBe(fingerprint);
    expect(pushRegistrationFingerprint({ ...input, nativeBuildNumber: '18' })).not.toBe(fingerprint);
    expect(pushRegistrationFingerprint({ ...input, userId: 'user-2' })).not.toBe(fingerprint);
  });

  it('reuses only a matching recent successful receipt', () => {
    const now = 2_000_000_000_000;
    const fingerprint = pushRegistrationFingerprint(input);
    expect(canReusePushRegistration({ fingerprint, registeredAt: now - 1_000 }, fingerprint, now))
      .toBe(true);
    expect(canReusePushRegistration(
      { fingerprint, registeredAt: now - PUSH_REGISTRATION_RECONCILE_MS },
      fingerprint,
      now,
    )).toBe(false);
    expect(canReusePushRegistration({ fingerprint: 'other', registeredAt: now }, fingerprint, now))
      .toBe(false);
    expect(canReusePushRegistration({ fingerprint, registeredAt: now + 1 }, fingerprint, now))
      .toBe(false);
  });

  it('uses bounded one, three, and ten second jittered retries', () => {
    expect(pushRegistrationRetryDelay(0, () => 0.5)).toBe(1_000);
    expect(pushRegistrationRetryDelay(1, () => 0.5)).toBe(3_000);
    expect(pushRegistrationRetryDelay(2, () => 0.5)).toBe(10_000);
    expect(pushRegistrationRetryDelay(3, () => 0.5)).toBeNull();
    expect(pushRegistrationRetryDelay(2, () => 0)).toBe(8_000);
    expect(pushRegistrationRetryDelay(2, () => 1)).toBe(12_000);
  });
});
