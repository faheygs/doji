import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import { targetKinds, type TargetKind } from './safety-target';
import type { SafetyQueue } from './safety-record';
import type { createBusinessOwnership } from './business-claim';
export type SafetyReportInput = Readonly<{
  p_id: string;
  p_revision: number;
  p_command_id: string;
  p_input: Readonly<{ kind: TargetKind; target_id: string; fingerprint: string; note: string }>;
}>;
export function validSafetyReport(input: SafetyReportInput) {
  return (
    record(input) &&
    Object.keys(input).sort().join(',') === 'p_command_id,p_id,p_input,p_revision' &&
    uuid(input.p_id) &&
    uuid(input.p_command_id) &&
    Number.isSafeInteger(input.p_revision) &&
    input.p_revision > 0 &&
    input.p_revision < Number.MAX_SAFE_INTEGER &&
    record(input.p_input) &&
    Object.keys(input.p_input).sort().join(',') === 'fingerprint,kind,note,target_id' &&
    Object.hasOwn(targetKinds, input.p_input.kind) &&
    uuid(input.p_input.target_id) &&
    typeof input.p_input.fingerprint === 'string' &&
    /^[a-f\d]{64}$/.test(input.p_input.fingerprint) &&
    typeof input.p_input.note === 'string' &&
    input.p_input.note === input.p_input.note.trim() &&
    [...input.p_input.note].length >= 10 &&
    input.p_input.note.length <= 2000
  );
}
export function safetyReportReceipt(value: unknown, input: SafetyReportInput) {
  if (
    !record(value) ||
    value.id !== input.p_id ||
    value.revision !== input.p_revision + 1 ||
    value.outcome !== 'saved' ||
    !uuid(value.report_id)
  )
    throw Error('Report creation could not be verified.');
  return { id: input.p_id, reportId: value.report_id, revision: input.p_revision + 1 };
}
export function createSafetyReport(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: SafetyReportInput, queue: SafetyQueue, signal: AbortSignal) => {
    if (!validSafetyReport(input) || !['moderation', 'restricted_safety'].includes(queue))
      throw Error('Invalid exact-content report.');
    input = Object.freeze({ ...input, p_input: Object.freeze({ ...input.p_input }) });
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state(),
        caps = state.operator?.capabilities;
      if (
        !captured.session ||
        state.session !== captured.session ||
        state.phase !== 'ready' ||
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
      .request('/safety/create-report', {
        method: 'POST',
        body: input,
      })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    const receipt = safetyReportReceipt(value, input);
    options.touch();
    return receipt;
  };
}
