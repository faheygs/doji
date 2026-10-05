import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type TestLabStatus = 'detected' | 'not_detected' | 'unknown';
let cached: TestLabStatus | undefined;

/** Read once per process; missing modules/older binaries cannot break error reporting. */
export function androidTestLabStatus(): TestLabStatus | undefined {
  if (Platform.OS !== 'android') return undefined;
  if (cached !== undefined) return cached;
  try {
    const value = requireOptionalNativeModule<{ firebaseTestLab?: unknown }>('DojiTestEnvironment')?.firebaseTestLab;
    cached = value === 'detected' || value === 'not_detected' ? value : 'unknown';
  } catch {
    cached = 'unknown';
  }
  return cached;
}
