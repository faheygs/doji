import AsyncStorage from '@react-native-async-storage/async-storage';
import { newCommandId } from './idempotency';
import { recordOperationalFailure } from './telemetry';
import type { PushRegistrationReceipt } from './pushRegistrationPolicy';

export const INSTALLATION_KEY = '@doji/push-installation-id';
export const REGISTRATION_RECEIPT_KEY = '@doji/push-registration-receipt:v1';

export async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = newCommandId('installation');
  await AsyncStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

export async function readRegistrationReceipt(): Promise<PushRegistrationReceipt | null> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRATION_RECEIPT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PushRegistrationReceipt>;
    if (typeof value.fingerprint !== 'string' || typeof value.registeredAt !== 'number') {
      throw new Error('Invalid push registration receipt');
    }
    return { fingerprint: value.fingerprint, registeredAt: value.registeredAt };
  } catch {
    void AsyncStorage.removeItem(REGISTRATION_RECEIPT_KEY);
    return null;
  }
}

export async function persistRegistrationReceipt(fingerprint: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      REGISTRATION_RECEIPT_KEY,
      JSON.stringify({ fingerprint, registeredAt: Date.now() } satisfies PushRegistrationReceipt),
    );
  } catch (error) {
    // Registration already committed. Cache persistence is only a load
    // optimization and must never turn a working endpoint into a failure.
    recordOperationalFailure('push', 'registration-receipt-persist', error);
  }
}
