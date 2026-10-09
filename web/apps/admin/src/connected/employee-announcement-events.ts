import type { Realtime } from 'ably';
import { record, uuid } from '../../../../../website/admin-portal/workflow-contracts.mts';
/** Subscribe only with the existing moderation topic grant and editorial read permission. */
export async function subscribeAnnouncementEvents(
  client: Realtime,
  current: () => boolean,
  hint: (id: string) => void,
) {
  await client.channels
    .get('moderation:global', { params: { rewind: '2m' } })
    .subscribe((message) => {
      if (
        !current() ||
        !/^moderation\.announcement\.(create|save|publish|cancel)$/.test(message.name ?? '') ||
        !record(message.data) ||
        !uuid(message.data.aggregateId)
      )
        return;
      const id: unknown = message.data.eventId || message.id;
      if (typeof id !== 'string' || !id.length || id.length > 160) return;
      hint(id);
    });
}
