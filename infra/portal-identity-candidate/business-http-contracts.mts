import type { createBusinessSessionStore } from './business-session-store.mts';
import type { createWorkosBusinessProvider } from './workos-business-provider.mts';
import type { createBusinessApplicationAdapter } from './business-application-adapter.mts';

export interface BusinessHttpConfig {
  enabled: boolean;
  signupEnabled: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
  encryptionKey: string;
  termsVersion: string;
  privacyVersion: string;
}
export interface BusinessHttpDependencies {
  store: ReturnType<typeof createBusinessSessionStore>;
  provider: ReturnType<typeof createWorkosBusinessProvider>;
  verify: (request: Request) => Promise<unknown>;
  application: ReturnType<typeof createBusinessApplicationAdapter>;
  admission: (input: { signup: boolean; proof: unknown; signal: AbortSignal }) => Promise<boolean>;
  now?: () => number;
}
