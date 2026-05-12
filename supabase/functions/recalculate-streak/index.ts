/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';
import { recomputeUserStreakFromEvents } from '../_shared/streak.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/**
 * Allows either CRON_SECRET (server) or a logged-in user's JWT (must match user_id).
 */
async function assertAuthorizedForUser(req: Request, userId: string): Promise<Response | null> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (cronSecret && token === cronSecret) return null;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user || userData.user.id !== userId) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const user_id = body.user_id as string | undefined;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const denied = await assertAuthorizedForUser(req, user_id);
    if (denied) return denied;

    const result = await recomputeUserStreakFromEvents(supabase, user_id);

    return new Response(
      JSON.stringify({ current_streak: result.current_streak, longest_streak: result.longest_streak }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('recalculate-streak error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
