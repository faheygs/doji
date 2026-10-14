// Exact identity tuples, never email addresses or browser-supplied application IDs.
export type PortalRealm = 'business' | 'employee';
export interface PortalIdentity {
  realm: PortalRealm;
  issuer: string;
  audience: string;
  subject: string;
  sessionId: string;
}
export type CheckPortalSession = (
  identity: Readonly<PortalIdentity>,
  signal: AbortSignal,
) => Promise<unknown>;
export type PortalFetch = (url: string, options: RequestInit) => Promise<Response>;
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
