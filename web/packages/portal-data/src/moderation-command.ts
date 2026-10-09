import { record } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { createBusinessOwnership } from './business-claim';
import {
  moderationRequest,
  moderationReceipt,
  validModerationInput,
  type ModerationInput,
} from './moderation-command-contracts';
export function createModerationCommand(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: ModerationInput, signal: AbortSignal) => {
    input = Object.freeze({ ...input });
    if (!validModerationInput(input)) throw Error('Invalid moderation command.');
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state(),
        caps = state.operator?.capabilities;
      if (
        !captured.session ||
        state.phase !== 'ready' ||
        state.session !== captured.session ||
        !caps?.moderation_read ||
        !caps.moderation_write ||
        (input.kind === 'ownership' && input.action === 'assign' && !caps.operator_manage) ||
        (input.restricted && (!caps.legal_read || !caps.restricted_review))
      )
        throw Error('Employee moderation permission required.');
      options.transport.assertSessionFresh();
    };
    if (!options.transport.hasSession()) {
      await options.signOut();
      throw Error('Employee session expired.');
    }
    current();
    const request = moderationRequest(input);
    const result = await options.transport
      .request(request.path, { method: 'POST', body: request.body })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    const receipt = moderationReceipt(result, input, captured.operator!.user_id);
    options.touch();
    return receipt;
  };
}
