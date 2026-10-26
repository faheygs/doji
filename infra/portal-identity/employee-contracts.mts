import type { PortalIdentity } from './portal-contracts.mts';

export const employeeStagingOrigin = 'https://admin-staging.dojipro.com';
export const employeeStagingProject = 'ohrcupagdoilkwhecict';
export const employeeStagingClient = 'client_01M3T5GJM7JZVQQ7CGHNJD0QMZ';
export const employeeSharedStagingClient = 'client_01M51GRQJVKXFZ98RG21MK7J64';
export const employeeSharedIssuerClient = 'client_01M3VE4WTBYS2XN6NZPH9EDMQD';
export function isEmployeeOrigin(origin: string): boolean {
  return origin === 'https://admin.dojipro.com' || origin === employeeStagingOrigin;
}

export interface EmployeeActor extends PortalIdentity {
  realm: 'employee';
  mfaVerified: true;
  expiresAtSeconds: number;
}
export interface EmployeeCommand {
  name: string;
  args: Record<string, unknown>;
}
export interface EmployeeApplication<Actor = EmployeeActor> {
  authorize(actor: Actor, signal: AbortSignal): Promise<unknown>;
  command(actor: Actor, input: EmployeeCommand, signal: AbortSignal): Promise<unknown>;
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
