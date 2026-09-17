type TimedRealtimeEvent = {
  available_at: string;
  created_at: string;
  topic: string;
};

export function logRealtimeLatency(events: TimedRealtimeEvent[]): void {
  if (events.length === 0) return;
  const now = Date.now();
  const ordered = events
    .map((event) =>
      Math.max(0, now - Math.max(Date.parse(event.created_at), Date.parse(event.available_at))),
    )
    .sort((left, right) => left - right);
  const percentile = (value: number) =>
    ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * value) - 1))];
  const maxMs = ordered[ordered.length - 1];
  const record = JSON.stringify({
    metric: 'domain_realtime_publish',
    count: events.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs,
    topic: events[0].topic,
  });
  if (maxMs > 5_000) console.warn(record);
  else console.log(record);
}
