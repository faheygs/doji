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

  const { data: isAdmin, error: capabilityError } = await database
    .rpc('is_current_user_admin');
  if (capabilityError) {
    console.error('[realtime-token] capability lookup failed', capabilityError.message);
    return new Response('Unable to authorize realtime access', { status: 500 });
  }

  const ablyKey = Deno.env.get('ABLY_API_KEY');
  if (!ablyKey) return new Response('Realtime service is not configured', { status: 500 });

  const requestBody = request.method === 'POST'
    ? await request.json().catch(() => ({})) as { postIds?: unknown }
    : {};
  const requestedPostIds = Array.isArray(requestBody.postIds)
    ? [...new Set(requestBody.postIds.filter(
      (value): value is string =>
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    ))]
    : [];
  if (requestedPostIds.length > 64) {
    return new Response('Too many realtime post subscriptions', { status: 400 });
  }

  let authorizedPostIds: string[] = [];
  if (requestedPostIds.length > 0) {
    // The request uses the caller's JWT, so normal post RLS is the capability
    // authority. A guessed, blocked, or no-longer-visible post simply does not
    // appear and never reaches the Ably token.
    const { data: visiblePosts, error: postAccessError } = await database
      .from('posts')
      .select('id')
      .in('id', requestedPostIds);
    if (postAccessError) {
      console.error('[realtime-token] post capability lookup failed', postAccessError.message);
      return new Response('Unable to authorize realtime access', { status: 500 });
    }
    authorizedPostIds = (visiblePosts ?? []).map((post) => post.id);
  }

  const ably = new Rest({ key: ablyKey });
  const capability: Record<string, string[]> = {
    'doji:global': ['subscribe'],
    'feed:public': ['subscribe'],
    'leaderboard:global': ['subscribe'],
    [`user:${user.id}:events`]: ['subscribe'],
  };
  for (const postId of authorizedPostIds) {
    capability[`post:${postId}`] = ['subscribe'];
  }
  if (isAdmin === true) {
    capability['moderation:global'] = ['subscribe'];
  }

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: user.id,
    // Short renewal bounds stale access after a friendship/block/privacy
    // change while still avoiding a token request per socket message.
    ttl: 15 * 60 * 1000,
    capability: JSON.stringify(capability),
  });
  return Response.json(tokenRequest);
});
