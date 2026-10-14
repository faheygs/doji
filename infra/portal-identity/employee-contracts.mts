import type { PortalIdentity } from './portal-contracts.mts';

export interface EmployeeActor extends PortalIdentity {
  realm: 'employee';
  mfaVerified: true;
  expiresAtSeconds: number;
}
export interface EmployeeCommand {
  name: string;
  args: Record<string, unknown>;
}
export interface EmployeeApplication {
  authorize(actor: EmployeeActor, signal: AbortSignal): Promise<unknown>;
  command(actor: EmployeeActor, input: EmployeeCommand, signal: AbortSignal): Promise<unknown>;
}
export type SqlParameter = string | number | boolean | null;
export type PortalExecute = (
  role: string,
  sql: string,
  parameters: SqlParameter[],
  signal: AbortSignal,
) => Promise<unknown>;
export interface StorageReference {
  bucket: string;
  path: string;
  expiresIn: number;
}
export type SignStorage = (reference: StorageReference, signal: AbortSignal) => Promise<string>;
export interface RealtimeGrant {
  clientId: string;
  ttl: number;
  capability: Record<string, string[]>;
}
export type SignRealtime = (grant: RealtimeGrant, signal: AbortSignal) => Promise<unknown>;
export type EmployeeHealth = (actor: EmployeeActor, signal: AbortSignal) => Promise<unknown>;
