import type { Realtime } from 'ably';
import { record, uuid } from '../../../../../website/admin-portal/workflow-contracts.mts';

/** Existing legacy moderation topic; no new provider topic or authoritative event data. */
export async function subscribeEmployeeAccess(
  client: Realtime,
  current: () => boolean,
  hint: (id: string) => void,
) {
  await client.channels
    .get('moderation:global', { params: { rewind: '2m' } })
    .subscribe((message) => {
      if (
        !current() ||
        message.name !== 'moderation.employee.access_changed' ||
        !record(message.data) ||
        !uuid(message.data.aggregateId)
      )
        return;
      const id: unknown = message.data.eventId || message.id;
      if (typeof id !== 'string' || !id.length || id.length > 160) return;
      hint(id);
    });
}
