import type { createEmployeeBrowserTransport } from '../../infra/portal-identity-candidate/employee-browser-transport.mts';
import type {} from '../ably-browser.d.mts';
export interface PortalConfig {
  mode?: string;
  editorialEnabled?: boolean;
  campaignsEnabled?: boolean;
  safetyRemovalEnabled?: boolean;
  supabaseUrl?: string;
  apiBaseUrl?: string;
  supabaseAnonKey?: string;
  employeeAccountsEnabled?: boolean;
  independentEmployeeIdentity?: boolean;
  businessApplicationsEnabled?: boolean;
  businessPrivacyEnabled?: boolean;
  staffWorkflowEnabled?: boolean;
  healthEventsEnabled?: boolean;
  unifiedSafetyEnabled?: boolean;
  onAccessInvalidated?(message: string): void;
  onSessionCleanupFailed?(message: string): void;
}
export interface AuthFactor {
  id: string;
  factor_type?: string;
  type?: string;
  status?: string;
  phone?: string;
  totp?: { qr_code: string; secret: string };
}
export interface AuthSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  started_at?: number;
  last_activity_at?: number;
  user?: { id: string; factors?: AuthFactor[] };
}
export interface PortalAuthorization {
  display_name?: string;
  username?: string;
  user_id?: string;
  roles?: string[];
  capabilities?: Record<string, boolean>;
}
export interface Cursor {
  at?: string;
  id?: string;
}
export interface RequestOptions {
  method?: string;
  body?: Record<string, unknown>;
}
export interface InvalidationHint {
  workKind?: unknown;
  type: string;
  aggregateId?: unknown;
  eventId?: unknown;
}
declare global {
  interface Window {
    DojiEmployeeTransport?: { create: typeof createEmployeeBrowserTransport };
  }
}
