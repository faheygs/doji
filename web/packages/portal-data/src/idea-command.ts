import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { createBusinessOwnership } from './business-claim';
import { ideaRecord, ideaVersion, type IdeaAction } from './idea-record';

export type IdeaInput = Readonly<{
  id: string;
  key: string;
  version: string;
  action: IdeaAction | 'claim' | 'release' | 'assign';
  target?: string;
  reason: string;
  revision: number;
}>;
export function validIdeaInput(input: IdeaInput) {
  return (
    record(input) &&
    Object.keys(input).sort().join(',') ===
      (input.action === 'assign'
        ? 'action,id,key,reason,revision,target,version'
        : 'action,id,key,reason,revision,version') &&
    (input.action !== 'assign' || uuid(input.target)) &&
    uuid(input.id) &&
    uuid(input.key) &&
    ideaVersion(input.version) &&
    Number.isSafeInteger(input.revision) &&
    input.revision >= 0 &&
    input.revision < Number.MAX_SAFE_INTEGER &&
    (['claim', 'release', 'assign'].includes(input.action)
      ? input.reason === ''
      : ['pending', 'approved', 'rejected'].includes(input.action) &&
        typeof input.reason === 'string' &&
        input.reason === input.reason.trim() &&
        input.reason.length >= 8 &&
        input.reason.length <= 1000)
  );
}
export function createIdeaCommand(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: IdeaInput, signal: AbortSignal) => {
    input = Object.freeze({ ...input });
    if (!validIdeaInput(input)) throw Error('Invalid idea command.');
    const assignment = ['claim', 'release', 'assign'].includes(input.action);
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state();
      if (
        !captured.session ||
        state.phase !== 'ready' ||
        state.session !== captured.session ||
        !state.operator?.capabilities.operations_read ||
        ((!assignment || input.action === 'assign') && !state.operator.capabilities.operator_manage)
      )
        throw Error('Employee idea-review permission required.');
      options.transport.assertSessionFresh();
    };
    if (!options.transport.hasSession()) {
      await options.signOut();
      throw Error('Employee session expired.');
    }
    current();
    const result = await options.transport
      .request(assignment ? '/staff-workflow/command' : '/portal/admin/editorial-command', {
        method: 'POST',
        body: assignment
          ? {
              p_kind: 'suggestion',
              p_id: input.id,
              p_revision: input.revision,
              p_source_version: input.version,
              p_action: input.action,
              p_target: input.action === 'assign' ? input.target : null,
              p_request_id: input.key,
            }
          : {
              kind: 'suggestions',
              action: input.action,
              id: input.id,
              version: input.version,
              input: {},
              reason: input.reason,
              idempotencyKey: input.key,
            },
      })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    if (assignment) {
      if (
        !record(result) ||
        result.id !== input.id ||
        result.kind !== 'suggestion' ||
        result.revision !== input.revision + 1 ||
        typeof result.replayed !== 'boolean' ||
        result.assigned_to !==
          (input.action === 'assign'
            ? input.target
            : input.action === 'claim'
              ? captured.operator!.user_id
              : null)
      )
        throw Error('Assignment outcome could not be verified.');
    } else if (record(result) && result.item_unavailable === true) {
      if (
        result.id !== input.id ||
        result.kind !== 'suggestions' ||
        result.action !== input.action ||
        result.outcome !== 'saved' ||
        !ideaVersion(result.version)
      )
        throw Error('Idea outcome could not be verified.');
    } else {
      // The existing RPC returns the authorized CURRENT item on replay, not its old state.
      ideaRecord(result, input.id);
    }
    options.touch();
    return { id: input.id, recorded: true };
  };
}
