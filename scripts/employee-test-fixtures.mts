import assert from 'node:assert/strict';
import type { EmployeeActor } from '../infra/portal-identity-candidate/employee-contracts.mts';
import { record } from '../infra/portal-identity-candidate/portal-contracts.mts';

export const testEmployee: EmployeeActor = Object.freeze({
  realm: 'employee',
  mfaVerified: true,
  subject: 'user_employee',
  sessionId: 'session_one',
  audience: 'client_employee',
  issuer: 'https://api.workos.com/user_management/client_employee',
  expiresAtSeconds: 2000000000,
});
export function present<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  if (value === undefined) throw Error('Missing test result');
  return value;
}
export function testRecord(value: unknown): Record<string, unknown> {
  assert.ok(record(value), 'Expected an object result');
  return value;
}
export function testList(value: unknown): unknown[] {
  assert.ok(Array.isArray(value), 'Expected an array result');
  return value;
}
