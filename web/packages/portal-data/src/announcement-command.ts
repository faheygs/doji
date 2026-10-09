import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { createBusinessOwnership } from './business-claim';
import { announcementRecord } from './announcements';
import {
  announcementVersion as version,
  freezeAnnouncementCommand,
  type AnnouncementCommand,
} from './announcement-command-contract';
export {
  freezeAnnouncementCommand,
  type AnnouncementCommand,
} from './announcement-command-contract';
export function createAnnouncementCommand(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: AnnouncementCommand, signal: AbortSignal) => {
    input = freezeAnnouncementCommand(input);
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state();
      if (
        !captured.session ||
        state.session !== captured.session ||
        state.phase !== 'ready' ||
        !state.operator?.capabilities.operations_read ||
        !state.operator.capabilities.operator_manage
      )
        throw Object.assign(Error('Announcement write permission required.'), { status: 403 });
      options.transport.assertSessionFresh();
    };
    if (!options.transport.hasSession()) {
      await options.signOut();
      throw Error('Employee session expired.');
    }
    current();
    const cancel = input.p_action === 'cancel';
    const result = await options.transport
      .request(cancel ? '/portal/admin/editorial-command' : '/announcements/compose', {
        method: 'POST',
        body:
          input.p_action === 'cancel'
            ? {
                kind: 'announcements',
                action: 'cancel',
                id: input.p_id,
                version: input.p_version,
                input: {},
                reason: input.p_reason,
                idempotencyKey: input.p_request_id,
              }
            : { ...input },
      })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    let id: string;
    if (cancel) {
      const item = announcementRecord(result, input.p_id!);
      if (item.state !== 'cancelled') throw Error('Cancellation could not be verified.');
      id = item.id;
    } else {
      if (!record(result) || typeof result.replayed !== 'boolean' || !record(result.command))
        throw Error('Announcement receipt could not be verified.');
      const receipt = result.command;
      if (
        !uuid(receipt.id) ||
        (input.p_id !== null && receipt.id !== input.p_id) ||
        receipt.request_id !== input.p_request_id ||
        receipt.action !== input.p_action ||
        !version(receipt.version) ||
        receipt.state !== (input.p_action === 'save_draft' ? 'draft' : 'published') ||
        !['draft', 'live', 'scheduled', 'expired'].includes(String(receipt.display_state)) ||
        (input.p_action === 'save_draft' && receipt.display_state !== 'draft')
      )
        throw Error('Announcement receipt could not be verified.');
      id = receipt.id;
      // A replay receipt records the original command, not the current delivery/status.
      if (result.item !== null) announcementRecord(result.item, id);
    }
    options.touch();
    return { id, action: input.p_action };
  };
}
