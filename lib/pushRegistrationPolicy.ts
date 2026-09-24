export const PUSH_REGISTRATION_RECONCILE_MS = 6 * 60 * 60 * 1000;

const RETRY_BASE_MS = [1_000, 3_000, 10_000] as const;

export type PushRegistrationFingerprintInput = Readonly<{
  installationId: string;
  userId: string;
  nativeToken: string;
  expoToken: string | null;
  platform: string;
  environment: string;
  appVersion: string | null;
  nativeBuildNumber: string | null;
  releaseChannel: string;
  notificationContractVersion: number;
  pushEnabled: boolean;
}>;

export type PushRegistrationReceipt = Readonly<{
  fingerprint: string;
  registeredAt: number;
}>;

/**
 * Persist only an irreversible, collision-resistant-enough local checksum of
 * the registration inputs. This is cache identity, never authentication or a
 * server authorization decision, so native provider tokens are not stored in
 * plaintext by this optimization.
 */
export function pushRegistrationFingerprint(input: PushRegistrationFingerprintInput): string {
  const value = JSON.stringify([
    input.installationId,
    input.userId,
    input.nativeToken,
    input.expoToken,
    input.platform,
    input.environment,
    input.appVersion,
    input.nativeBuildNumber,
    input.releaseChannel,
    input.notificationContractVersion,
    input.pushEnabled,
  ]);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `v1:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function canReusePushRegistration(
  receipt: PushRegistrationReceipt | null,
  fingerprint: string,
  now = Date.now(),
): boolean {
  if (!receipt || receipt.fingerprint !== fingerprint) return false;
  if (!Number.isFinite(receipt.registeredAt) || receipt.registeredAt > now) return false;
  return now - receipt.registeredAt < PUSH_REGISTRATION_RECONCILE_MS;
}

/** Delay before retry 2/3/4, with bounded +/-20% jitter. */
export function pushRegistrationRetryDelay(
  retryIndex: number,
  random = Math.random,
): number | null {
  const base = RETRY_BASE_MS[retryIndex];
  if (base == null) return null;
  return Math.round(base * (0.8 + random() * 0.4));
}
