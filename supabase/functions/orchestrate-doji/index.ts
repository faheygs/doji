/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type OrchestrationRequest = {
  action?: 'prelive' | 'activate' | 'close' | 'close_targeted';
  dailyEventId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get('DOJI_ORCHESTRATOR_SECRET');
  if (!expectedSecret || request.headers.get('x-orchestrator-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const input = await request.json() as OrchestrationRequest;
  if (
    !input.action ||
    !['prelive', 'activate', 'close', 'close_targeted'].includes(input.action) ||
    !input.dailyEventId ||
    !UUID_PATTERN.test(input.dailyEventId)
  ) {
    return new Response('Invalid orchestration request', { status: 400 });
  }

  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const functionName = input.action === 'prelive'
    ? 'begin_daily_event_prelive'
    : input.action === 'activate'
      ? 'activate_daily_event'
      : input.action === 'close_targeted'
        ? 'close_targeted_daily_event'
        : 'close_daily_event';
  const { data, error } = await database.rpc(functionName, {
    p_daily_event_id: input.dailyEventId,
  });
  if (error) return new Response(error.message, { status: 500 });

  return Response.json(data);
});
