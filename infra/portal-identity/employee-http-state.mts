import { record, integer } from './portal-contracts.mts';
import type { EmployeeActor } from './employee-contracts.mts';
import type { EmployeeTokens } from './workos-employee-provider.mts';

export interface EmployeeGrant extends EmployeeTokens {
  identity: unknown;
  mfaReceipt: string;
}
export interface EmployeeFlow {
  pending: string;
  csrf: string;
  expires: number;
}
export interface SavedEmployeeSession {
  grant: EmployeeGrant;
  actor: EmployeeActor;
  csrf: string;
  created: number;
  touched: number;
}
const invalid = () => Object.assign(Error('Employee access unavailable'), { status: 401 });
export function employeeActor(value: unknown): EmployeeActor {
  if (
    !record(value) ||
    value.realm !== 'employee' ||
    value.mfaVerified !== true ||
    typeof value.issuer !== 'string' ||
    typeof value.audience !== 'string' ||
    typeof value.subject !== 'string' ||
    typeof value.sessionId !== 'string' ||
    !integer(value.expiresAtSeconds)
  )
    throw invalid();
  return {
    realm: value.realm,
    mfaVerified: value.mfaVerified,
    issuer: value.issuer,
    audience: value.audience,
    subject: value.subject,
    sessionId: value.sessionId,
    expiresAtSeconds: value.expiresAtSeconds,
  };
}
export function employeeFlow(value: unknown): EmployeeFlow {
  if (
    !record(value) ||
    typeof value.pending !== 'string' ||
    typeof value.csrf !== 'string' ||
    !integer(value.expires)
  )
    throw invalid();
  return { pending: value.pending, csrf: value.csrf, expires: value.expires };
}
export function employeeSession(value: unknown): SavedEmployeeSession {
  if (
    !record(value) ||
    !record(value.grant) ||
    typeof value.csrf !== 'string' ||
    !integer(value.created) ||
    !integer(value.touched)
  )
    throw invalid();
  const grant = value.grant;
  if (
    typeof grant.subject !== 'string' ||
    typeof grant.accessToken !== 'string' ||
    typeof grant.refreshToken !== 'string' ||
    typeof grant.mfaReceipt !== 'string'
  )
    throw invalid();
  return {
    grant: {
      subject: grant.subject,
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      mfaReceipt: grant.mfaReceipt,
      identity: grant.identity,
    },
    actor: employeeActor(value.actor),
    csrf: value.csrf,
    created: value.created,
    touched: value.touched,
  };
}
