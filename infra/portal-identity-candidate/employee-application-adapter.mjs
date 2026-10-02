// Server-side boundary: accepts only a verified employee identity, never a UUID
// supplied by the portal. The database reauthorizes each fixed atomic operation.
import { employeeRouteContracts } from './employee-route-contracts.mjs';
export const employeeOperations = Object.freeze(
  Object.fromEntries(Object.entries(employeeRouteContracts).map(([name, c]) => [name, c.fields])),
);
const fail = (status) => Object.assign(Error('Employee operation unavailable'), { status });
export function createEmployeeApplicationAdapter(execute) {
  if (typeof execute !== 'function') throw fail(503);
  async function command(actor, input, signal) {
    if (
      actor?.realm !== 'employee' ||
      actor.mfaVerified !== true ||
      !/^user_[A-Za-z0-9]{1,80}$/.test(actor.subject || '') ||
      !/^session_[A-Za-z0-9]{1,80}$/.test(actor.sessionId || '') ||
      !/^client_[A-Za-z0-9]{1,80}$/.test(actor.audience || '') ||
      actor.issuer !== `https://api.workos.com/user_management/${actor.audience}`
    )
      throw fail(403);
    if (!input || !Object.hasOwn(employeeOperations, input.name)) throw fail(403);
    const contract = employeeRouteContracts[input.name],
      fields = contract.fields;
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
    let encoded;
    try {
      encoded = JSON.stringify(args);
    } catch {
      throw fail(400);
    }
    if (encoded.length > 16000) throw fail(400);
    for (let i = 0; i < fields.length; i++) {
      const name = fields[i],
        value = args[name],
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
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
      )
        throw fail(400);
      if (
        type === 'timestamp with time zone' &&
        (!Number.isFinite(Date.parse(value)) || value.length > 50)
      )
        throw fail(400);
      if (name === 'p_limit' && (value < 1 || value > 50)) throw fail(400);
    }
    if (!signal || signal.aborted) throw fail(503);
    try {
      return await execute(
        'doji_employee_application',
        'select portal_identity_private.employee_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result',
        [actor.issuer, actor.audience, actor.subject, actor.sessionId, true, input.name, encoded],
        signal,
      );
    } catch (error) {
      throw fail(
        { 42501: 403, 22023: 400, '22P02': 400, PT409: 409, 55000: 409 }[error?.code] || 503,
      );
    }
  }
  return {
    command,
    authorize: (actor, signal) =>
      command(actor, { name: 'get_admin_portal_session_v3', args: {} }, signal),
  };
}
