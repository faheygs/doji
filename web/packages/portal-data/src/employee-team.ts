import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import type { createBusinessOwnership } from './business-claim';

export const employeeRoles = [
  'super_admin',
  'operations',
  'moderator',
  'legal_reviewer',
  'business_reviewer',
] as const;
export type EmployeeRole = (typeof employeeRoles)[number];
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const email = (v: unknown): v is string => text(v, 254) && /^[^\s@]+@[^\s@]+$/.test(v);
const roles = (v: unknown): v is EmployeeRole[] =>
  Array.isArray(v) &&
  v.length <= employeeRoles.length &&
  new Set(v).size === v.length &&
  v.every((role) => employeeRoles.includes(role));
const status = (v: unknown): v is string =>
  typeof v === 'string' && ['pending', 'active', 'disabled'].includes(v);
export function employeeDirectory(value: unknown) {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 100)
    throw Error('Employee directory could not be verified.');
  const items = value.items.map((item) => {
    if (
      !record(item) ||
      !uuid(item.user_id) ||
      !email(item.username) ||
      !text(item.display_name, 160) ||
      !status(item.status) ||
      !roles(item.roles) ||
      !text(item.last_changed_at, 80) ||
      !Number.isFinite(Date.parse(item.last_changed_at))
    )
      throw Error('Employee directory could not be verified.');
    return {
      id: item.user_id,
      email: item.username,
      name: item.display_name,
      status: item.status,
      roles: [...item.roles],
      changedAt: item.last_changed_at,
    };
  });
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.email.toLowerCase())).size !== items.length
  )
    throw Error('Employee directory could not be verified.');
  return items;
}
export function readEmployeeTeam(controller: EmployeeSessionController, signal: AbortSignal) {
  return controller.read(
    'operator_manage',
    '/portal/admin/operators',
    undefined,
    employeeDirectory,
    signal,
  );
}
export type EmployeeRoleInput = Readonly<{
  username: string;
  role: EmployeeRole;
  active: boolean;
  reason: string;
  idempotencyKey: string;
}>;
export function validEmployeeRoleInput(input: EmployeeRoleInput) {
  return (
    record(input) &&
    Object.keys(input).sort().join(',') === 'active,idempotencyKey,reason,role,username' &&
    email(input.username) &&
    input.username === input.username.trim().toLowerCase() &&
    employeeRoles.includes(input.role) &&
    typeof input.active === 'boolean' &&
    text(input.reason, 1000) &&
    input.reason === input.reason.trim() &&
    input.reason.length >= 10 &&
    uuid(input.idempotencyKey)
  );
}
export function createEmployeeRoleCommand(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: EmployeeRoleInput, signal: AbortSignal) => {
    input = Object.freeze({ ...input });
    if (!validEmployeeRoleInput(input)) throw Error('Invalid employee access change.');
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const now = options.state();
      if (
        !captured.session ||
        now.session !== captured.session ||
        now.phase !== 'ready' ||
        !now.operator?.capabilities.operator_manage
      )
        throw Error('Employee access-management permission required.');
      options.transport.assertSessionFresh();
    };
    if (!options.transport.hasSession()) {
      await options.signOut();
      throw Error('Employee session expired.');
    }
    current();
    const result = await options.transport
      .request('/portal/admin/operator-role', { method: 'POST', body: input })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    if (
      !record(result) ||
      result.changed_role !== input.role ||
      result.granted !== input.active ||
      !status(result.status) ||
      !roles(result.roles) ||
      result.roles.includes(input.role) !== input.active
    )
      throw Error('Employee access outcome could not be verified.');
    options.touch();
    // A replay receipt is a recorded outcome, not a claim about current access.
    return { recorded: true };
  };
}
