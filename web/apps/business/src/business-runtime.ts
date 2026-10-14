import type { createBusinessBrowserClient } from '../../../../infra/portal-identity/business-browser-client.mts';
import type { identityConfig } from '../../../../website/business-portal/identity/config.mts';
import type { createApplicationController } from '../../../../website/business-portal/application-client.mts';
export type Client = ReturnType<typeof createBusinessBrowserClient>;
export type Config = ReturnType<typeof identityConfig>;
export type Controller = ReturnType<typeof createApplicationController>;
export type Runtime = { client: Client; controller: Controller; config: Config };
declare global {
  interface Window {
    DOJI_REACT_BUSINESS_CONFIG?: {
      registrationUntil: string;
      ownedAuthEnabled?: boolean;
      maintenanceEnabled?: boolean;
      acceptanceUntil?: string;
      acceptanceExistingAccount?: boolean;
      setupEnabled?: boolean;
    };
  }
}
export const failureText = (error: unknown) =>
  error instanceof Error ? error.message : 'Please try again.';
