/* Portal presentation only: never changes delivery, paging, or member authorization. */
export type HealthState = 'healthy' | 'unknown' | 'watch' | 'degraded' | 'critical';
// Read boundaries intentionally retain unknown values: missing or malformed
// telemetry must remain unknown, never become a healthy zero.
export type HealthRecord = Record<string, unknown>;
export interface HealthInput {
  operational?: HealthRecord;
  sentry?: HealthRecord;
  history?: HealthRecord[];
  failed?: boolean;
  historyFailed?: boolean;
  loaded?: boolean;
  historyLoaded?: boolean;
  generatedAt?: string;
  now?: number;
}
type Signal = { name: string; state: HealthState; label: string; detail: string };
type DeadlineState = 'closed' | 'unknown' | 'critical' | 'overdue' | 'watch' | 'healthy';
type Deadline = { state: DeadlineState; at: number; remaining?: number };
const timestamp = (value: unknown) => Date.parse(typeof value === 'string' ? value : '');
export const labels = {
  healthy: 'Healthy',
  watch: 'Watch',
  degraded: 'Degraded',
  critical: 'Critical',
  unknown: 'Limited visibility',
};
const rank = { healthy: 0, unknown: 1, watch: 2, degraded: 3, critical: 4 };
const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const worst = (states: HealthState[]) =>
  states.reduce<HealthState>((a, b) => (rank[b] > rank[a] ? b : a), 'healthy');
const signal = (name: string, state: HealthState, detail: string): Signal => ({
  name,
  state,
  label: labels[state],
  detail,
});
function latency(
  p95: number | null,
  max: number | null,
  samples: number | null,
  slow: number | null,
): HealthState {
  if (max !== null && max > 30000) return 'critical';
  if (samples !== null && samples >= 20 && p95 !== null && p95 > 5000) return 'degraded';
  if ((p95 !== null && p95 >= 1000) || (max !== null && max > 5000) || (slow !== null && slow > 0))
    return 'watch';
  if (p95 === null || max === null || samples === null || slow === null || samples < 20)
    return 'unknown';
  return 'healthy';
}
export function eventState(e: HealthRecord): HealthState {
  const delivery = latency(
    number(e.realtime_p95_ms),
    number(e.realtime_max_ms),
    number(e.realtime_sample_count),
    number(e.realtime_over_5s),
  );
  if (
    [e.outbox_exhausted, e.push_shards_exhausted, e.push_shards_expired].some(
      (v) => (number(v) ?? 0) > 0,
    )
  )
    return 'critical';
  if ((number(e.outbox_unpublished) ?? 0) > 0 || e.healthy === false)
    return worst([delivery, 'degraded']);
  const complete = [
    e.outbox_unpublished,
    e.outbox_exhausted,
    e.push_shards_exhausted,
    e.push_shards_expired,
  ].every((v) => number(v) !== null);
  return worst([delivery, e.healthy === true && complete ? 'healthy' : 'unknown']);
}
export function evaluate({
  operational = {},
  sentry = {},
  history = [],
  failed = false,
  historyFailed = false,
  loaded = true,
  historyLoaded = true,
  generatedAt,
  now = Date.now(),
}: HealthInput = {}) {
  const checked = timestamp(operational.checked_at);
  const stale =
    failed ||
    operational.available === false ||
    !Number.isFinite(checked) ||
    now - checked > 180000 ||
    checked > now + 60000;
  const p95 = number(operational.realtime_p95_ms_5m),
    max = number(operational.realtime_max_ms_5m);
  const samples = number(operational.realtime_sample_count_5m),
    slow = number(operational.realtime_over_5s_5m);
  const first = signal(
    'Realtime delivery · last 5 minutes',
    stale ? 'unknown' : latency(p95, max, samples, slow),
    stale
      ? 'The delivery snapshot is unavailable or more than 3 minutes old.'
      : `p95 ${p95 ?? '—'} ms · max ${max ?? '—'} ms · ${samples ?? '—'} samples · ${slow ?? '—'} over 5s. Fewer than 20 samples cannot establish healthy latency.`,
  );
  const signals = [first];
  if (first.state === 'unknown') {
    first.label = stale
      ? loaded
        ? 'Reading outdated'
        : 'Loading'
      : samples === 0
        ? 'No recent traffic'
        : samples === null
          ? 'Telemetry missing'
          : 'Limited sample';
    first.detail = stale
      ? loaded
        ? 'Current latency is unknown. Check the monitoring connection and the last observation time.'
        : 'Waiting for the first authorized delivery reading.'
      : samples === 0
        ? 'No delivery events were measured in the last 5 minutes. Latency cannot be assessed; review the latest Doji summary below.'
        : samples === null
          ? 'The monitoring response did not include an event count.'
          : `${samples} events measured; at least 20 are needed for a reliable latency assessment. Review the latest Doji summary below.`;
  }
  for (const [name, activeKey, terminalKey] of [
    ['Realtime outbox', 'outbox_overdue', 'outbox_exhausted'],
    ['Push fanout', 'push_stale_shards', 'push_exhausted_shards'],
  ] as const) {
    const active = number(operational[activeKey]),
      terminal = number(operational[terminalKey]);
    const state = stale
      ? 'unknown'
      : (terminal ?? 0) > 0
        ? 'critical'
        : (active ?? 0) > 0
          ? 'degraded'
          : active === null || terminal === null
            ? 'unknown'
            : 'healthy';
    const backlog = signal(
      name,
      state,
      `${active ?? '—'} ${activeKey === 'outbox_overdue' ? 'overdue events' : 'stale shards'} · ${terminal ?? '—'} exhausted.`,
    );
    signals.push(backlog);
    if (state === 'unknown') {
      backlog.label = !loaded ? 'Loading' : stale ? 'Reading outdated' : 'Telemetry missing';
      backlog.detail = !loaded
        ? 'Waiting for the first authorized backlog reading.'
        : 'Current backlog counts cannot be verified from this snapshot.';
    }
  }
  const credentials = number(operational.apns_provider_credential_errors);
  const credentialSignal = signal(
    'APNs provider credentials',
    stale || credentials === null ? 'unknown' : credentials > 0 ? 'critical' : 'healthy',
    `${credentials ?? '—'} credential failures. This does not verify that a phone displayed a notification.`,
  );
  signals.push(credentialSignal);
  if (credentialSignal.state === 'unknown') {
    credentialSignal.label = !loaded ? 'Loading' : stale ? 'Reading outdated' : 'Telemetry missing';
    credentialSignal.detail = 'The latest credential-failure count is not available.';
  }
  if (!stale && operational.healthy === false)
    signals.push(
      signal(
        'Server health guardrail',
        'degraded',
        'The server reports unhealthy delivery; an empty backlog does not override this.',
      ),
    );
  const delivery = worst(signals.map((s) => s.state));
  const issues = Array.isArray(sentry.issues) ? sentry.issues : [];
  const snapshotTime = timestamp(sentry.observed_at || generatedAt || operational.checked_at);
  const available =
    !failed &&
    Number.isFinite(snapshotTime) &&
    now - snapshotTime <= 180000 &&
    snapshotTime <= now + 60000 &&
    sentry.configured === true &&
    sentry.available === true &&
    Array.isArray(sentry.issues);
  const app = signal(
    'App errors · Sentry last 24 hours',
    !available ? 'unknown' : issues.length ? 'watch' : 'healthy',
    !available
      ? 'Sentry coverage is unavailable. Missing errors are not proof that the app is healthy.'
      : issues.length
        ? `${issues.length}${issues.length >= 25 ? '+' : ''} unresolved issue groups returned. Review crashes, account, comments, and timeout errors below; this is not a live outage count.`
        : 'No unresolved issues returned by the bounded production query. Resolved issues, unreported failures, and feature success rates are not covered.',
  );
  if (!available) {
    const accessDenied = sentry.upstream_status === 401 || sentry.upstream_status === 403;
    app.label = !loaded
      ? 'Loading'
      : sentry.configured === false
        ? 'Not connected'
        : accessDenied
          ? 'Access denied'
          : 'Feed unavailable';
    app.detail = !loaded
      ? 'Waiting for the first authorized app-error snapshot.'
      : sentry.configured === false
        ? 'Sentry is not configured for this portal. An operator must connect read-only Sentry access before app errors can be reviewed here.'
        : accessDenied
          ? 'Sentry rejected the monitoring credentials. Check the read-only token and project access; refreshing alone may not fix this.'
          : `App-error monitoring is unavailable or outdated${sentry.upstream_status ? ` (HTTP ${sentry.upstream_status})` : ''}. Check the Sentry connection. This does not prove the app is down.`;
  }
  const recent = history.filter((e) => {
    const end = timestamp(e.observed_through || e.closes_at || e.fires_at);
    return Number.isFinite(end) && end >= now - 86400000 && end <= now;
  });
  const incidents = recent.filter((e) => ['watch', 'degraded', 'critical'].includes(eventState(e)));
  const incomplete =
    !historyLoaded ||
    historyFailed ||
    !recent.length ||
    recent.some((e) => !e.finalized_at || eventState(e) === 'unknown');
  const past = signal(
    'Recent Doji delivery · last 24 hours',
    incidents.length ? 'watch' : incomplete ? 'unknown' : 'healthy',
    incidents.length
      ? `${incidents.length} Doji summaries have delivery problems or missed targets. Current recovery does not erase these results.${historyFailed ? ' History refresh failed; retained summaries may be stale.' : ''}`
      : incomplete
        ? 'Event coverage is missing, low-sample, or still settling. This is not an all-clear for today.'
        : 'Available finalized event summaries meet the displayed delivery targets. They do not measure every app request.',
  );
  if (past.state === 'unknown')
    past.label =
      !historyLoaded && !historyFailed
        ? 'Loading history'
        : historyFailed
          ? 'History unavailable'
          : !recent.length
            ? 'No recent summary'
            : recent.some((e) => !e.finalized_at)
              ? 'Still settling'
              : 'Limited sample';
  if (!historyLoaded && !historyFailed)
    past.detail = 'Waiting for the authorized recent Doji summaries.';
  const allSignals = [...signals, app, past];
  const attention = allSignals.filter((s) => rank[s.state] >= rank.watch);
  const unknown = allSignals.filter((s) => s.state === 'unknown');
  const state = worst([delivery, app.state, past.state]);
  // Measurement coverage is separate from failures. A quiet window must never
  // claim healthy latency, but neither is it evidence of an outage.
  const quiet = !stale && samples === 0 && first.state === 'unknown';
  const coverage = !loaded
    ? 'loading'
    : stale || !available || historyFailed
      ? 'unavailable'
      : unknown.length
        ? 'partial'
        : 'current';
  return {
    state,
    label: labels[state],
    delivery,
    signals: allSignals,
    attention,
    coverage,
    quiet,
    coverageLabel: {
      loading: 'Loading readings',
      unavailable: 'Monitoring needs attention',
      partial: 'Some measurements limited',
      current: 'Available readings current',
    }[coverage],
    incidents: incidents.length,
    stale,
    title:
      state === 'healthy'
        ? 'Measured services within target'
        : state === 'unknown'
          ? !loaded
            ? 'Checking platform health'
            : quiet && coverage === 'partial'
              ? 'Quiet delivery window'
              : 'Some health signals are unverified'
          : `${labels[state]} — review the affected signals`,
    summary: attention.length
      ? `${attention.length} signal${attention.length === 1 ? '' : 's'} need attention. ${app.state === 'watch' ? 'Reported app issues are not proof of a current outage.' : 'See the affected services below.'}`
      : quiet
        ? 'No delivery events in the last 5 minutes. Other readings and recent Doji results are shown separately.'
        : `${allSignals.length - unknown.length} of ${allSignals.length} available health signals verified. Unmeasured services are not included.`,
  };
}
const reviewClosed = (item: HealthRecord) =>
  typeof item.status === 'string' &&
  ['resolved', 'approved', 'draft', 'dismissed', 'action_taken', 'reversed'].includes(item.status);
const reviewSevere = (item: HealthRecord) =>
  item.priority === 'critical' ||
  item.priority === 'high' ||
  item.severity === 'level_2' ||
  item.severity === 'level_3';
export function reviewDeadline(item: HealthRecord, now = Date.now()): Deadline {
  const at = timestamp(item.deadlineAt || item.deadline_at);
  if (reviewClosed(item)) return { state: 'closed', at };
  if (!Number.isFinite(at)) return { state: 'unknown', at };
  const remaining = at - now;
  return {
    at,
    remaining,
    state:
      remaining <= 0
        ? reviewSevere(item)
          ? 'critical'
          : 'overdue'
        : remaining <= 4 * 3600000
          ? 'watch'
          : 'healthy',
  };
}
export function reviewQueue(items: HealthRecord[], total: unknown, now = Date.now()) {
  const active = [
    ...new Map(items.filter((item) => !reviewClosed(item)).map((item) => [item.id, item])).values(),
  ];
  const states = active.map((item) => reviewDeadline(item, now));
  const complete =
    typeof total === 'number' && Number.isInteger(total) && total >= 0 && active.length === total;
  const overdue = states.filter((s) => ['overdue', 'critical'].includes(s.state));
  const critical = overdue.filter((s) => s.state === 'critical').length;
  const nearing = states.filter((s) => s.state === 'watch').length;
  const unknown = states.filter((s) => s.state === 'unknown').length;
  const prefix = complete ? '' : 'At least ';
  let state: DeadlineState | 'empty' = 'unknown',
    note: string;
  if (overdue.length) {
    state = critical ? 'critical' : 'overdue';
    const minutes = Math.max(1, Math.floor((now - Math.min(...overdue.map((s) => s.at))) / 60000));
    const age = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    note = `${prefix}${overdue.length} overdue${critical ? ` · ${critical} high-risk — urgent review` : ''} · Oldest ${age} past target${nearing ? ` · ${nearing} due within 4h` : ''}`;
  } else if (nearing) {
    state = 'watch';
    note = `${prefix}${nearing} due within 4h`;
  } else if (complete && !active.length) {
    state = 'empty';
    note = 'No open reports';
  } else if (complete && !unknown) {
    state = active.some(reviewSevere) ? 'watch' : 'healthy';
    note =
      state === 'watch' ? 'High-priority review · Within target' : 'All open reports within target';
  } else note = 'Deadline coverage incomplete';
  if (!complete || unknown)
    note += ` · ${active.length} loaded${Number.isInteger(total) ? ` of ${total}` : ''}${unknown ? `; ${unknown} missing deadlines` : ''} · Review work queue`;
  return {
    state,
    note,
    overdue: overdue.length,
    critical,
    nearing,
    complete: complete && !unknown,
  };
}
export function createHealthHintFilter() {
  const revisions = new Map<string, bigint>();
  return (message: unknown): boolean => {
    if (!message || typeof message !== 'object') return false;
    const m = message as Record<string, unknown>;
    if (
      m.name !== 'staff.health.changed' ||
      !m.data ||
      typeof m.data !== 'object' ||
      Array.isArray(m.data)
    )
      return false;
    const data = m.data as Record<string, unknown>;
    if (
      !['delivery', 'history', 'sentry'].includes(String(data.source)) ||
      typeof data.source !== 'string' ||
      typeof data.revision !== 'string' ||
      !/^[1-9][0-9]{0,17}$/.test(data.revision)
    )
      return false;
    const revision = BigInt(data.revision);
    if (revision <= (revisions.get(data.source) ?? 0n)) return false;
    revisions.set(data.source, revision);
    return true;
  };
}
const api = { evaluate, eventState, labels, reviewDeadline, reviewQueue, createHealthHintFilter };
declare global {
  interface Window {
    DojiPortalHealth: typeof api;
  }
}
if (typeof window !== 'undefined') Object.assign(window, { DojiPortalHealth: Object.freeze(api) });
