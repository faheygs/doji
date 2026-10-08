// Optional sidecar to an EXISTING monitoring invocation. Never schedules a
// check, repairs an alarm, retries a write or changes the health response.
export async function recordEmployeeHealthObservation(
  enabled: boolean,
  health: Record<string, unknown>,
  record: (args: {
    p_source: string;
    p_observed_at: string;
    p_event_key: string;
  }) => PromiseLike<{ error: unknown }>,
): Promise<boolean> {
  if (!enabled) return false;
  const observed = health.checked_at;
  if (typeof observed !== 'string' || !Number.isFinite(Date.parse(observed))) return false;
  try {
    const result = await record({
      p_source: 'delivery',
      p_observed_at: observed,
      p_event_key: `delivery:${observed}`,
    });
    return !result.error;
  } catch {
    return false;
  }
}
