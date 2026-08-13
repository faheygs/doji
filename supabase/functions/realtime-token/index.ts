/// <reference path="../deno.d.ts" />
import { Rest } from 'npm:ably@2.26.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  const authorization = request.headers.get('authorization');
  if (!authorization) return new Response('Unauthorized', { status: 401 });

  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error } = await database.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await database
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  const ablyKey = Deno.env.get('ABLY_API_KEY');
  if (!ablyKey) return new Response('Realtime service is not configured', { status: 500 });

  const ably = new Rest({ key: ablyKey });
  const capability: Record<string, string[]> = {
    'doji:global': ['subscribe', 'history'],
    'feed:public': ['subscribe', 'history'],
    'leaderboard:global': ['subscribe', 'history'],
    [`user:${user.id}:events`]: ['subscribe', 'history'],
  };
  if (profile?.is_admin === true) {
    capability['moderation:global'] = ['subscribe', 'history'];
  }

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: user.id,
    ttl: 60 * 60 * 1000,
    capability: JSON.stringify(capability),
  });
  return Response.json(tokenRequest);
});
