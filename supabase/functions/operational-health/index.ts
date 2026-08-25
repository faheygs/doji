/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get('OUTBOX_RELAY_SECRET');
  if (!expectedSecret || request.headers.get('x-outbox-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const [healthResult, alarmResult] = await Promise.all([
    database.rpc('get_operational_health'),
    database.rpc('get_repairable_doji_alarms', { p_limit: 20 }),
  ]);
  if (healthResult.error) return new Response(healthResult.error.message, { status: 500 });
  if (alarmResult.error) return new Response(alarmResult.error.message, { status: 500 });
  const health = healthResult.data && typeof healthResult.data === 'object'
    ? healthResult.data as Record<string, unknown>
    : { healthy: false, error: 'No health snapshot returned' };
  return Response.json({ ...health, alarm_repairs: alarmResult.data ?? [] });
});
