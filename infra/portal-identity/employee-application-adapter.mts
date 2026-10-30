// Server-side boundary: accepts only a verified employee identity, never a UUID
// supplied by the portal. The database reauthorizes each fixed atomic operation.
import { employeeRouteContracts } from './employee-route-contracts.mts';
import { employeeWorkflowContracts, employeeWorkflowSql } from './employee-workflow-contracts.mts';
import {
  employeeHealthContracts,
  employeeHealthSql,
  employeeWorkflowHealthSql,
} from './employee-health-contracts.mts';
import {
  employeeAnnouncementContract,
  employeeAnnouncementSql,
} from './employee-announcement-contracts.mts';
import { record } from './portal-contracts.mts';
import { employeeHistoryContracts, employeeHistorySql } from './employee-history-contracts.mts';
import type { EmployeeActor, EmployeeCommand, PortalExecute } from './employee-contracts.mts';
const contracts = Object.freeze({
  ...employeeRouteContracts,
  ...employeeWorkflowContracts,
  ...employeeHealthContracts,
});
export const employeeOperations = Object.freeze(
  Object.fromEntries(Object.entries(contracts).map(([name, c]) => [name, c.fields])),
);
const fail = (status: number) => Object.assign(Error('Employee operation unavailable'), { status });
export function createEmployeeApplicationAdapter(
  execute: PortalExecute,
  options: {
    announcementComposeEnabled?: boolean;
    historyReadsEnabled?: boolean;
    identity?: { clientId: string; issuerClientId?: string };
  } = {},
) {
  if (typeof execute !== 'function') throw fail(503);
  const identity = options.identity ? { ...options.identity } : undefined;
  if (
    identity &&
    (!/^client_[A-Za-z0-9]{1,80}$/.test(identity.clientId) ||
      (identity.issuerClientId !== undefined &&
        !/^client_[A-Za-z0-9]{1,80}$/.test(identity.issuerClientId)))
  )
    throw fail(503);
  const announcementComposeEnabled = options.announcementComposeEnabled === true;
  const historyReadsEnabled = options.historyReadsEnabled === true;
  async function command(actor: EmployeeActor, input: EmployeeCommand, signal: AbortSignal) {
    if (
      actor?.realm !== 'employee' ||
      actor.mfaVerified !== true ||
      !/^user_[A-Za-z0-9]{1,80}$/.test(actor.subject || '') ||
      !/^session_[A-Za-z0-9]{1,80}$/.test(actor.sessionId || '') ||
      !/^client_[A-Za-z0-9]{1,80}$/.test(actor.audience || '') ||
      (identity !== undefined && actor.audience !== identity.clientId) ||
      actor.issuer !==
        `https://api.workos.com/user_management/${
          identity?.issuerClientId ?? identity?.clientId ?? actor.audience
        }`
    )
      throw fail(403);
    const compose = input?.name === 'admin_announcement_compose_v1';
    const history = !!input && Object.hasOwn(employeeHistoryContracts, input.name);
    if (
      !input ||
      (history
        ? !historyReadsEnabled
        : compose
          ? !announcementComposeEnabled
          : !Object.hasOwn(employeeOperations, input.name))
    )
      throw fail(403);
    const contract = history
      ? employeeHistoryContracts[input.name]
      : compose
        ? employeeAnnouncementContract
        : contracts[input.name];
    if (!contract) throw fail(403);
    const fields = contract.fields;
    const supplied = input.args;
    if (
      !supplied ||
      typeof supplied !== 'object' ||
      Array.isArray(supplied) ||
      Object.keys(supplied).some((k) => !fields.includes(k)) ||
      fields.some((k) => !Object.hasOwn(supplied, k) && !Object.hasOwn(contract.defaults, k))
    )
      throw fail(400);
    const args = { ...contract.defaults, ...supplied };
    if (
      history &&
      (!Number.isInteger(args.p_limit) || Number(args.p_limit) < 1 || Number(args.p_limit) > 25)
    )
      throw fail(400);
    let encoded;
    try {
      encoded = JSON.stringify(args);
    } catch {
      throw fail(400);
    }
    if (encoded.length > 16000) throw fail(400);
    for (const [i, name] of fields.entries()) {
      const value = args[name],
        type = contract.types[i];
      if (value === null) continue;
      if (type === 'jsonb') {
        if (typeof value !== 'object') throw fail(400);
      } else if (type === 'boolean') {
        if (typeof value !== 'boolean') throw fail(400);
      } else if (type === 'integer' || type === 'bigint') {
        if (!Number.isSafeInteger(value)) throw fail(400);
      } else if (typeof value !== 'string' || value.includes('\0')) throw fail(400);
      if (
        type === 'uuid' &&
        (typeof value !== 'string' ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
      )
        throw fail(400);
      if (
        type === 'timestamp with time zone' &&
        (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || value.length > 50)
      )
        throw fail(400);
      if (name === 'p_limit' && (typeof value !== 'number' || value < 1 || value > 50))
        throw fail(400);
    }
    if (!signal || signal.aborted) throw fail(503);
    try {
      return await execute(
        'doji_employee_application',
        history
          ? employeeHistorySql
          : compose
            ? employeeAnnouncementSql
            : Object.hasOwn(employeeHealthContracts, input.name)
              ? input.name === 'get_admin_workflow_health_v1'
                ? employeeWorkflowHealthSql
                : employeeHealthSql
              : Object.hasOwn(employeeWorkflowContracts, input.name)
                ? employeeWorkflowSql
                : 'select portal_identity_private.employee_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result',
        [actor.issuer, actor.audience, actor.subject, actor.sessionId, true, input.name, encoded],
        signal,
      );
    } catch (error) {
      // Legacy announcement validation/version failures roll back atomically.
      // Do not present a definite rejection as an uncertain publication.
      const announcementWrite =
        compose || (input.name === 'admin_editorial_command_v1' && args.p_kind === 'announcements');
      const statuses: Record<string, number> = {
        42501: 403,
        22023: 400,
        '22P02': 400,
        PT409: 409,
        55000: 409,
        ...(announcementWrite ? { '40001': 409, P0001: 400 } : {}),
      };
      throw fail(
        record(error) && typeof error.code === 'string' ? statuses[error.code] || 503 : 503,
      );
    }
  }
  return {
    command,
    authorize: (actor: EmployeeActor, signal: AbortSignal) =>
      command(actor, { name: 'get_admin_portal_session_v3', args: {} }, signal),
  };
}
