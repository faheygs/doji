import type { Realtime, TokenRequest } from 'ably';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { subscribeWorkflow } from '../../../../../website/admin-portal/workflow-events.mts';
import { record } from '../../../../../website/admin-portal/workflow-contracts.mts';
import { createHealthHintFilter } from '../../../../../website/admin-portal/health-model.mts';
import { loadEmployeeRealtimeSdk } from './employee-realtime-sdk';
import { subscribeEmployeeAccess } from './employee-access-events';
import { subscribeAnnouncementEvents } from './employee-announcement-events';

export type EmployeeConnection =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'interrupted'
  | 'unavailable';
const channelCaps: Record<string, string[]> = {
  moderation: ['moderation_read'],
  restricted: ['moderation_read', 'legal_read'],
  ideas: ['operations_read'],
  business: ['business_read'],
  privacy: ['legal_read', 'operator_manage'],
};
function token(value: unknown): TokenRequest {
  if (
    !record(value) ||
    !['keyName', 'nonce', 'mac', 'capability'].every((k) => typeof value[k] === 'string') ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp)
  )
    throw Error('Realtime authorization unavailable.');
  return value as unknown as TokenRequest;
}

/** One session-owned socket. Events invalidate authorized reads; they never install rows. */
export function attachEmployeeRealtime(
  controller: EmployeeSessionController,
  enabled: boolean,
  onState: (state: EmployeeConnection) => void,
  loadSdk = loadEmployeeRealtimeSdk,
  onHealthState: (state: EmployeeConnection) => void = () => {},
) {
  const initial = controller.getSnapshot();
  const accessHints = initial.operator?.capabilities.moderation_read === true;
  const operations = initial.operator?.capabilities.operations_read === true;
  if (!enabled || !initial.session || !initial.operator) {
    onState('disabled');
    onHealthState('disabled');
    return () => {};
  }
  const capability = ['moderation_read', 'operations_read', 'business_read', 'legal_read'].find(
    (name) => initial.operator!.capabilities[name] === true,
  );
  if (!capability) {
    onState('disabled');
    onHealthState('disabled');
    return () => {};
  }
  const abort = new AbortController();
  let client: Realtime | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshing = false;
  let healthSubscribed = false;
  let healthAuthorized = false;
  let transport: EmployeeConnection = 'connecting';
  let healthChannel: EmployeeConnection = 'connecting';
  const reportHealth = () =>
    onHealthState(
      !healthAuthorized ? 'disabled' : transport === 'connected' ? healthChannel : transport,
    );
  const areas = new Set<'work' | 'safety' | 'operations' | 'audit' | 'team' | 'announcements'>();
  const seen = new Set<string>();
  const current = () =>
    !stopped && controller.getSnapshot().session === initial.session && controller.isFresh();
  const visible = () => current() && document.visibilityState !== 'hidden' && navigator.onLine;
  function stop() {
    stopped = true;
    abort.abort();
    clearTimeout(timer);
    areas.clear();
    seen.clear();
    onHealthState('disabled');
    unsubscribe();
    const active = client;
    client = null;
    try {
      active?.close();
    } catch {
      /* Local session revocation remains decisive. */
    }
  }
  const unsubscribe = controller.subscribe(() => {
    if (!current()) stop();
  });
  function schedule() {
    if (!visible() || refreshing || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, 250);
  }
  async function refresh() {
    if (!visible() || !areas.size) return;
    refreshing = true;
    const selected = [...areas];
    areas.clear();
    try {
      await controller.restore();
      if (!visible()) return;
      const { cache, session } = controller.getSnapshot();
      if (!cache || !session) return;
      await Promise.all(
        selected.map((area) =>
          cache.invalidateQueries(
            {
              queryKey: ['portal', session.realm, session.subject, session.epoch, area],
              refetchType: 'active',
            },
            { cancelRefetch: false },
          ),
        ),
      );
    } finally {
      refreshing = false;
      if (areas.size) schedule();
    }
  }
  async function start() {
    onState('connecting');
    const names = await controller.read(
      capability!,
      '/staff-workflow/channels',
      {},
      (value) => {
        if (
          !Array.isArray(value) ||
          value.length > 5 ||
          new Set(value).size !== value.length ||
          !value.every(
            (name) =>
              typeof name === 'string' &&
              name.startsWith('staff:workflow:') &&
              channelCaps[name.slice(15)]?.every(
                (cap) => initial.operator!.capabilities[cap] === true,
              ),
          )
        )
          throw Error('Employee channels could not be verified.');
        return value as string[];
      },
      abort.signal,
    );
    if (!current()) return;
    if (!names.length && !accessHints && !operations) {
      onState('unavailable');
      return;
    }
    const sdk = await loadSdk();
    if (!current()) return;
    client = new sdk.Realtime({
      autoConnect: false,
      echoMessages: false,
      realtimeRequestTimeout: 20_000,
      authCallback: (_params, callback) => {
        if (!current()) {
          callback('Employee session ended.', null);
          return;
        }
        void controller
          .read(capability!, '/portal/admin/realtime-token', undefined, token, abort.signal)
          .then(
            (value) => {
              if (!current()) return callback('Employee session ended.', null);
              callback(null, value);
              void subscribeHealth(value).catch(() => {
                if (current()) {
                  healthChannel = 'unavailable';
                  reportHealth();
                }
              });
            },
            () => callback('Realtime authorization unavailable.', null),
          );
      },
    });
    client.connection.on((change) => {
      if (!current()) return;
      transport = change.current === 'connected' ? 'connected' : 'interrupted';
      onState(transport);
      reportHealth();
      if (change.current === 'connected') {
        areas.add('work');
        areas.add('safety');
        if (operations) {
          areas.add('operations');
          areas.add('audit');
          areas.add('announcements');
        }
        if (initial.operator?.capabilities.operator_manage) areas.add('team');
        schedule();
      }
    });
    client.connect();
    if (
      accessHints &&
      operations &&
      names.includes('staff:workflow:moderation')
    )
      await subscribeAnnouncementEvents(client, current, (id) => {
        const key = 'announcement:' + id;
        if (seen.has(key)) return;
        seen.add(key);
        if (seen.size > 128) seen.delete(seen.values().next().value!);
        areas.add('announcements');
        areas.add('audit');
        schedule();
      });
    if (accessHints)
      await subscribeEmployeeAccess(client, current, (id) => {
        const key = 'access:' + id;
        if (seen.has(key)) return;
        seen.add(key);
        if (seen.size > 128) seen.delete(seen.values().next().value!);
        if (initial.operator?.capabilities.operator_manage) areas.add('team');
        if (operations) areas.add('audit');
        areas.add('work');
        areas.add('safety');
        schedule();
      });
    await subscribeWorkflow(client, names, current, (hint) => {
      if (!current()) return;
      if (typeof hint.eventId === 'string') {
        if (seen.has(hint.eventId)) return;
        seen.add(hint.eventId);
        if (seen.size > 128) seen.delete(seen.values().next().value!);
      }
      areas.add('work');
      if (operations) areas.add('audit');
      if (['report', 'appeal', 'external_intake'].includes(String(hint.workKind)))
        areas.add('safety');
      schedule();
    });
  }
  async function subscribeHealth(grant: TokenRequest) {
    // Only subscribe when the existing, server-issued grant authorizes the
    // exact staff channel. Local config cannot enable hosted health access.
    const grants: unknown = JSON.parse(grant.capability || '{}');
    healthAuthorized =
      operations &&
      record(grants) &&
      Array.isArray(grants['staff:health:operations']) &&
      grants['staff:health:operations'].includes('subscribe');
    reportHealth();
    if (!current() || !healthAuthorized || healthSubscribed || !client) return;
    healthSubscribed = true;
    try {
      const acceptHealth = createHealthHintFilter();
      const channel = client.channels.get('staff:health:operations', { params: { rewind: '2m' } });
      channel.on((change) => {
        if (!current() || !healthAuthorized) return;
        healthChannel =
          change.current === 'attached'
            ? 'connected'
            : change.current === 'failed'
              ? 'unavailable'
              : 'interrupted';
        reportHealth();
        // Reattachment can lose continuity even when the socket stayed connected.
        if (change.current === 'attached') {
          areas.add('operations');
          schedule();
        }
      });
      await channel.subscribe((message) => {
        if (!current() || !healthAuthorized || !acceptHealth(message)) return;
        areas.add('operations');
        schedule();
      });
    } catch (error) {
      // Ably retains listeners after attachment failure; reauthorization must not duplicate them.
      throw error;
    }
  }
  void start().catch(() => {
    const reportFailure = current();
    stop();
    if (reportFailure) {
      onState('unavailable');
      onHealthState('unavailable');
    }
  });
  return stop;
}
