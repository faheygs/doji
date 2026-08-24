type CommandGatewayEnv = {
  OUTBOX_RELAY_ALARM: {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): {
      fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    };
  };
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

const MAX_COMMAND_BYTES = 128 * 1024;

// Commands are deliberately explicit. The gateway is not a general PostgREST
// proxy and cannot be used to invoke read or privileged service-role RPCs.
const AUTHENTICATED_COMMANDS = new Set([
  'block_user',
  'buy_in_today',
  'clear_notification_history',
  'complete_doji_with_post',
  'create_own_profile',
  'delete_comment',
  'dismiss_notification',
  'edit_comment',
  'equip_shop_item',
  'mark_notification_center_opened',
  'moderate_report',
  'purchase_shop_item',
  'register_native_push_endpoint',
  'remove_friendship',
  'request_friendship',
  'respond_to_friendship',
  'review_challenge_suggestion',
  'set_post_comments_disabled',
  'submit_challenge_suggestion',
  'submit_comment',
  'submit_content_report',
  'submit_poll_vote',
  'sync_notification_center_state',
  'toggle_comment_like',
  'toggle_poll_vote_like',
  'toggle_post_reaction',
  'unblock_user',
  'unregister_push_installation',
  'update_own_profile',
]);

function responseHeaders(contentType = 'application/json'): Headers {
  return new Headers({
    'access-control-allow-headers': 'authorization, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': contentType,
  });
}

function jsonError(status: number, message: string): Response {
  return Response.json(
    { code: `DOJI_COMMAND_${status}`, details: null, hint: null, message },
    { status, headers: responseHeaders() },
  );
}

function commandName(pathname: string): string | null {
  const match = pathname.match(/^\/commands\/rpc\/([a-z0-9_]+)$/);
  return match?.[1] ?? null;
}

/**
 * Runs an authenticated Postgres command through the same user JWT/RLS context
 * as the mobile client, then wakes the durable relay immediately after commit.
 * The database outbox trigger remains an independent recovery wake.
 */
export async function handleCommandGateway(
  request: Request,
  env: CommandGatewayEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const rpcName = commandName(url.pathname);
  if (!rpcName) return null;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders() });
  if (request.method !== 'POST') return jsonError(405, 'Method not allowed');
  if (!AUTHENTICATED_COMMANDS.has(rpcName)) return jsonError(404, 'Unknown command');

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonError(401, 'Authentication required');
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonError(503, 'Command service is not configured');
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_COMMAND_BYTES) {
    return jsonError(413, 'Command payload is too large');
  }
  try {
    const parsed = body ? JSON.parse(body) : {};
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return jsonError(400, 'Command payload must be a JSON object');
    }
  } catch {
    return jsonError(400, 'Command payload is not valid JSON');
  }

  const upstream = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${rpcName}`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        authorization,
        'content-profile': 'public',
        'content-type': 'application/json',
        'x-client-info': request.headers.get('x-client-info') ?? 'doji-command-gateway/1.0',
      },
      body: body || '{}',
    },
  );
  const upstreamBody = await upstream.arrayBuffer();

  if (upstream.ok) {
    try {
      const id = env.OUTBOX_RELAY_ALARM.idFromName('singleton');
      const wake = await env.OUTBOX_RELAY_ALARM.get(id).fetch('https://alarm.internal/wake', {
        method: 'POST',
      });
      if (!wake.ok) throw new Error(`Realtime wake failed (${wake.status})`);
    } catch (error) {
      // The command is already committed. Returning an error would encourage a
      // duplicate user action, so rely on the transactional pg_net wake and log.
      console.error('Immediate domain relay wake failed; database wake remains active', error);
    }
  }

  return new Response(upstreamBody, {
    status: upstream.status,
    headers: responseHeaders(upstream.headers.get('content-type') ?? 'application/json'),
  });
}
