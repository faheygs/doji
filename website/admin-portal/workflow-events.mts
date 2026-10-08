import { kind, record, uuid } from './workflow-contracts.mts';
import type { InvalidationHint } from './live-contracts.d.mts';
import type { Realtime } from 'ably';
const channels = ['moderation', 'restricted', 'ideas', 'business', 'privacy'].map(
  (k) => `staff:workflow:${k}`,
);
export async function subscribeWorkflow(
  client: Realtime,
  value: unknown,
  current: () => boolean,
  hint: (event: InvalidationHint) => void,
) {
  if (
    !Array.isArray(value) ||
    value.length > 5 ||
    new Set(value).size !== value.length ||
    !value.every((v) => channels.includes(v))
  )
    throw Error('Staff channels unavailable');
  for (const name of value as string[]) {
    if (!current()) return;
    await client.channels.get(name, { params: { rewind: '2m' } }).subscribe((message) => {
      if (!current() || !['staff.case.changed', 'staff.queue.changed'].includes(message.name || ''))
        return;
      const data: unknown = message.data;
      if (!record(data) || !kind(data.kind)) return;
      if (
        message.name === 'staff.case.changed' &&
        (!uuid(data.aggregateId) || data.id !== data.aggregateId)
      )
        return;
      hint({
        type: message.name!,
        eventId: data.eventId || message.id,
        aggregateId: data.aggregateId,
        workKind: data.kind,
      });
    });
  }
}

// Event-driven bounded coalescing, never interval polling. Each refresh rechecks
// employee authority; hints never install records or carry decision authority.
export function workflowInvalidator(refresh: () => void, active: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seen = new Set<string>();
  return {
    hint(value: InvalidationHint) {
      if (
        !active() ||
        !['staff.case.changed', 'staff.queue.changed'].includes(value.type) ||
        !kind(value.workKind)
      )
        return;
      if (typeof value.eventId === 'string') {
        if (seen.has(value.eventId)) return;
        seen.add(value.eventId);
        if (seen.size > 128) seen.delete(seen.values().next().value!);
      }
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          if (active()) refresh();
        }, 250);
    },
    clear() {
      clearTimeout(timer);
      timer = undefined;
      seen.clear();
    },
  };
}
