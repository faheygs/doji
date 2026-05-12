import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing auth token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userJwt = authHeader.slice(7);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = user.id;

  await adminClient.from('poll_votes').delete().eq('user_id', userId);
  await adminClient.from('reactions').delete().eq('user_id', userId);
  await adminClient.from('comments').delete().eq('user_id', userId);
  await adminClient.from('posts').delete().eq('user_id', userId);
  await adminClient.from('user_events').delete().eq('user_id', userId);
  await adminClient.from('user_badges').delete().eq('user_id', userId);
  await adminClient.from('weekly_xp').delete().eq('user_id', userId);
  await adminClient.from('streak_events').delete().eq('user_id', userId);
  await adminClient
    .from('friendships')
    .delete()
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  await adminClient.from('profiles').delete().eq('id', userId);

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

  if (deleteError) {
    return new Response(
      JSON.stringify({ error: 'Failed to delete auth user', detail: deleteError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
