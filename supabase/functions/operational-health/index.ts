/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { recordEmployeeHealthObservation } from './employee-health-observation.ts';
import { captureEmployeeHealthSnapshot } from './employee-health-snapshot.ts';
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get('OUTBOX_RELAY_SECRET');
  if (!expectedSecret || request.headers.get('x-outbox-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const [healthResult, alarmResult, archiveResult] = await Promise.all([
    database.rpc('get_operational_health'),
    database.rpc('get_repairable_doji_alarms', { p_limit: 20 }),
    database.rpc('refresh_daily_event_health_snapshots_v1', { p_limit: 5 }),
  ]);
  if (healthResult.error) return new Response(healthResult.error.message, { status: 500 });
  if (alarmResult.error) return new Response(alarmResult.error.message, { status: 500 });
  if (archiveResult.error) return new Response(archiveResult.error.message, { status: 500 });
  const health =
    healthResult.data && typeof healthResult.data === 'object'
      ? (healthResult.data as Record<string, unknown>)
      : { healthy: false, error: 'No health snapshot returned' };
  const snapshotEnabled = Deno.env.get('EMPLOYEE_HEALTH_SNAPSHOT_ENABLED') === 'true';
  const eventsEnabled = Deno.env.get('EMPLOYEE_HEALTH_EVENTS_ENABLED') === 'true';
  if (snapshotEnabled && eventsEnabled) console.warn('employee_health_modes_conflict');
  if (snapshotEnabled && !eventsEnabled) {
    try {
      EdgeRuntime.waitUntil(
        captureEmployeeHealthSnapshot(
          {
            enabled: true,
            eventsEnabled,
            environment: Deno.env.get('EMPLOYEE_HEALTH_SNAPSHOT_ENVIRONMENT'),
            supabaseUrl: Deno.env.get('SUPABASE_URL'),
          },
          health,
          (args, signal) =>
            database.rpc('capture_employee_health_snapshot_v1', args).abortSignal(signal),
        ),
      );
    } catch {
      console.warn('employee_health_snapshot_sidecar_unavailable');
    }
  }
  if (eventsEnabled && !snapshotEnabled) {
    // Diagnostic sidecar cannot make member recovery depend on event publishing.
    try {
      EdgeRuntime.waitUntil(
        recordEmployeeHealthObservation(true, health, (args) =>
          database
            .rpc('record_employee_health_change_v1', args)
            .abortSignal(AbortSignal.timeout(2000)),
        ),
      );
    } catch {
      // No payload or secret in this diagnostic; existing repair response survives.
      console.warn('employee_health_sidecar_unavailable');
    }
  }
  return Response.json({
    ...health,
    alarm_repairs: alarmResult.data ?? [],
    event_health_snapshots_refreshed: archiveResult.data ?? 0,
  });
});
