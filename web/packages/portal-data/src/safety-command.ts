import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { createBusinessOwnership } from './business-claim';
import type { SafetyQueue } from './safety-record';

export const safetyActions = {
  claim: 'Assign to me',
  reviewing: 'Start review',
  needs_information: 'Request information',
  removed: 'Record completed removal',
  not_actionable: 'Close request',
  reopen: 'Reopen request',
} as const;
export type SafetyAction = keyof typeof safetyActions;
export type SafetyInput = Readonly<{
  action: SafetyAction;
  note: string;
  message?: string;
  access_review?: string;
  copies_review?: string;
}>;
export type SafetyCommand = Readonly<{
  p_id: string;
  p_revision: number;
  p_command_id: string;
  p_input: SafetyInput;
}>;
const bounded = (v: unknown, min: number, max = 2000) =>
  typeof v === 'string' && v === v.trim() && [...v].length >= min && v.length <= max;
export function validSafetyCommand(input: SafetyCommand) {
  if (
    !record(input) ||
    Object.keys(input).sort().join(',') !== 'p_command_id,p_id,p_input,p_revision' ||
    !uuid(input.p_id) ||
    !uuid(input.p_command_id) ||
    !Number.isSafeInteger(input.p_revision) ||
    input.p_revision < 1 ||
    input.p_revision >= Number.MAX_SAFE_INTEGER ||
    !record(input.p_input)
  )
    return false;
  const value = input.p_input;
  if (
    !Object.hasOwn(safetyActions, value.action) ||
    !bounded(value.note, 10) ||
    Object.keys(value).some(
      (key) => !['action', 'note', 'message', 'access_review', 'copies_review'].includes(key),
    ) ||
    (value.message !== undefined && !bounded(value.message, 0))
  )
    return false;
  if (value.action === 'claim' && Object.keys(value).sort().join(',') !== 'action,note')
    return false;
  if (!['claim', 'reviewing'].includes(value.action) && !bounded(value.message, 10)) return false;
  if (value.action === 'removed')
    return (
      bounded(value.access_review, 20) &&
      (value.copies_review === undefined || bounded(value.copies_review, 20))
    );
  return value.access_review === undefined && value.copies_review === undefined;
}
export function safetyReceipt(value: unknown, input: SafetyCommand) {
  if (
    !record(value) ||
    value.id !== input.p_id ||
    value.revision !== input.p_revision + 1 ||
    value.outcome !== 'saved'
  )
    throw Error('Safety outcome could not be verified.');
  return { id: input.p_id, revision: input.p_revision + 1 };
}
export function createSafetyCommand(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: SafetyCommand, queue: SafetyQueue, signal: AbortSignal) => {
    if (!validSafetyCommand(input) || !['moderation', 'restricted_safety'].includes(queue))
      throw Error('Invalid safety command.');
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state(),
        caps = state.operator?.capabilities;
      if (
        !captured.session ||
        state.phase !== 'ready' ||
        captured.session !== state.session ||
        !caps?.moderation_read ||
        !caps.moderation_write ||
        (queue === 'restricted_safety' && !caps.legal_read)
      )
        throw Error('Employee safety permission required.');
      options.transport.assertSessionFresh();
    };
    if (!options.transport.hasSession()) {
      await options.signOut();
      throw Error('Employee session expired.');
    }
    current();
    const value = await options.transport
      .request('/safety/command', {
        method: 'POST',
        body: { ...input, p_input: { ...input.p_input } },
      })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    const receipt = safetyReceipt(value, input);
    options.touch();
    return receipt;
  };
}
