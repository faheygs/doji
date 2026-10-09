export type Scenario = 'sample' | 'disconnected' | 'stale';
export type HealthStatus = 'Within target' | 'Watch' | 'Degraded' | 'Not measured';
export type Service = {
  id: string;
  name: string;
  status: HealthStatus;
  summary: string;
  source: string;
  boundary: string;
  next: string;
  metrics: [string, string][];
};

// Deliberately synthetic, fixed fixtures. Never used as a production fallback.
export const sampleObservedAt = 'Oct 8, 2026 · 18:00 UTC';
export const history = [
  { day: 'Oct 3', p95: 380, max: 1100, samples: 48, overdue: 0, result: 'Within target' },
  { day: 'Oct 4', p95: 520, max: 1500, samples: 56, overdue: 0, result: 'Within target' },
  { day: 'Oct 5', p95: null, max: null, samples: 0, overdue: null, result: 'Not measured' },
  { day: 'Oct 6', p95: 740, max: 1900, samples: 61, overdue: 0, result: 'Within target' },
  { day: 'Oct 7', p95: 2100, max: 6100, samples: 43, overdue: 3, result: 'Watch' },
  { day: 'Oct 8', p95: 620, max: 1800, samples: 64, overdue: 0, result: 'Within target' },
] as const;

export const services: Service[] = [
  {
    id: 'delivery',
    name: 'Realtime delivery',
    status: 'Within target',
    summary: '620 ms p95 · 64 measured events',
    source: 'Operational health · last 5 minutes',
    boundary:
      'Server event publication latency, including staff events. Not end-to-end device delivery.',
    next: 'Compare slow events with the Doji history. A low-traffic window cannot establish healthy latency.',
    metrics: [
      ['p95', '620 ms'],
      ['Maximum', '1,800 ms'],
      ['Samples', '64'],
      ['Over 5 seconds', '0'],
    ],
  },
  {
    id: 'outbox',
    name: 'Event backlog',
    status: 'Within target',
    summary: '0 overdue · 0 exhausted',
    source: 'Operational health · current snapshot',
    boundary: 'Shared outbox counters, not exclusively member traffic.',
    next: 'Investigate overdue or exhausted work before retrying anything. This screen never performs repairs.',
    metrics: [
      ['Overdue events', '0'],
      ['Exhausted events', '0'],
    ],
  },
  {
    id: 'push',
    name: 'Push fanout',
    status: 'Within target',
    summary: '0 stale shards · 0 exhausted',
    source: 'Operational health · current snapshot',
    boundary:
      'Server fanout and APNs credential errors do not prove notification display on a phone.',
    next: 'Correlate registration failures with recovery evidence and the affected build.',
    metrics: [
      ['Stale shards', '0'],
      ['Exhausted shards', '0'],
      ['APNs credential errors', '0'],
    ],
  },
  {
    id: 'app',
    name: 'App errors',
    status: 'Watch',
    summary: '2 unresolved issue groups returned',
    source: 'Sentry · bounded production query · last 24 hours',
    boundary:
      'At most 25 unresolved groups; not a crash-free rate, all-error count or current outage count.',
    next: 'Review occurrence time, app release, platform and recovery evidence in the issue detail.',
    metrics: [
      ['Groups returned', '2'],
      ['Query limit', '25'],
    ],
  },
  {
    id: 'doji',
    name: 'Daily Doji',
    status: 'Watch',
    summary: '1 earlier delivery warning in sample history',
    source: 'Archived Doji summaries · bounded to 12',
    boundary:
      'Current recovery does not erase earlier failures. Missing summaries are not healthy results.',
    next: 'Open Doji history to compare per-event latency, samples and backlog.',
    metrics: [
      ['Sample summaries shown', '6'],
      ['Missing measurements', '1'],
    ],
  },
  ...[
    [
      'api',
      'API & database',
      'Request success, p50/p95/p99 latency, query saturation and connection capacity.',
    ],
    [
      'auth',
      'Authentication',
      'Member Supabase sessions and independent portal WorkOS sessions, measured separately.',
    ],
    [
      'hosting',
      'Hosting & Worker',
      'Request failures, execution limits, availability and regional coverage.',
    ],
    [
      'storage',
      'Media & storage',
      'Upload success, processing latency and authorized media access.',
    ],
    ['email', 'Email', 'Queue age, provider acceptance, delivery and bounce outcomes.'],
  ].map(([id, name, boundary]) => ({
    id: id!,
    name: name!,
    status: 'Not measured' as const,
    summary: 'Monitoring contract needed',
    source: 'No qualified aggregate source in this migration',
    boundary: boundary!,
    next: 'Define a bounded read, permissions, freshness and capacity budget before connecting this signal.',
    metrics: [],
  })),
];

export function statusColor(status: HealthStatus | string) {
  return status === 'Within target'
    ? 'success'
    : status === 'Watch'
      ? 'warning'
      : status === 'Degraded'
        ? 'error'
        : 'default';
}

export function scenarioView(scenario: Scenario) {
  return {
    hasSamples: scenario !== 'disconnected',
    title:
      scenario === 'sample'
        ? 'Example: app issues need review'
        : scenario === 'stale'
          ? 'Example: monitoring is out of date'
          : 'Platform status is unknown',
    description:
      scenario === 'sample'
        ? 'Current sample delivery is within target. Two app issue groups and one earlier Doji warning need investigation.'
        : scenario === 'stale'
          ? 'Retained examples are historical context only. No current service status can be established.'
          : 'Connect authorized health reads before drawing conclusions about the platform.',
  };
}
