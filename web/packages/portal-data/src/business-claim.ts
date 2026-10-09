import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { createEmployeeBrowserTransport } from '../../../../infra/portal-identity-candidate/employee-browser-transport.mts';
import type { EmployeeSessionState } from './employee-session';

export type BusinessOwnership = Readonly<{
  p_kind: 'business_application';
  p_id: string;
  p_revision: number;
  p_source_version: string;
  p_action: 'claim' | 'release' | 'assign';
  p_target: string | null;
  p_request_id: string;
}>;
export type BusinessClaim = BusinessOwnership & { p_action: 'claim'; p_target: null };
export function createBusinessOwnership(options: {
  state(): EmployeeSessionState;
  transport: ReturnType<typeof createEmployeeBrowserTransport>;
  restore(): Promise<void>;
  signOut(): Promise<void>;
  touch(): void;
}) {
  return async (input: BusinessOwnership, signal: AbortSignal) => {
    // Narrow command: never accepts arbitrary routes, actors, decisions or member writes.
    if (
      !record(input) ||
      Object.keys(input).sort().join(',') !==
        'p_action,p_id,p_kind,p_request_id,p_revision,p_source_version,p_target' ||
      input.p_kind !== 'business_application' ||
      !['claim', 'release', 'assign'].includes(input.p_action) ||
      (input.p_action === 'assign' ? !uuid(input.p_target) : input.p_target !== null) ||
      !uuid(input.p_id) ||
      !uuid(input.p_request_id) ||
      !Number.isSafeInteger(input.p_revision) ||
      input.p_revision < 0 ||
      input.p_revision >= Number.MAX_SAFE_INTEGER ||
      !/^\d{1,16}$/.test(input.p_source_version)
    )
      throw Error('Invalid assignment request.');
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state();
      if (
        state.phase !== 'ready' ||
        !captured.session ||
        state.session !== captured.session ||
        state.operator?.capabilities.business_read !== true ||
        (input.p_action === 'assign' && state.operator.capabilities.operator_manage !== true)
      )
        throw Error('Employee permission required.');
      options.transport.assertSessionFresh();
    };
    if (!options.transport.hasSession()) {
      await options.signOut();
      throw Error('Employee session expired.');
    }
    current();
    const target = input.p_action === 'claim' ? captured.operator!.user_id : input.p_target;
    const result = await options.transport
      .request('/staff-workflow/command', { method: 'POST', body: { ...input } })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    if (
      !record(result) ||
      result.kind !== input.p_kind ||
      result.id !== input.p_id ||
      result.revision !== input.p_revision + 1 ||
      result.assigned_to !== target ||
      typeof result.replayed !== 'boolean'
    )
      throw Error('Assignment outcome could not be verified.');
    options.touch();
    return {
      id: input.p_id,
      revision: input.p_revision + 1,
      assignedTo: target,
      replayed: result.replayed,
    };
  };
}
export function createBusinessClaim(options: Parameters<typeof createBusinessOwnership>[0]) {
  const command = createBusinessOwnership(options);
  return (input: BusinessClaim, signal: AbortSignal) => {
    if (input.p_action !== 'claim' || input.p_target !== null)
      throw Error('Invalid claim request.');
    return command(input, signal);
  };
}
