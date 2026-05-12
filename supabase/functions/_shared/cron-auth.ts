/**
 * Shared secret for cron / internal callers. Set in Supabase Dashboard → Edge Functions → Secrets:
 * CRON_SECRET=<random-long-string>
 *
 * Invoke with: Authorization: Bearer <CRON_SECRET>
 */
export function assertCronAuthorized(req: Request): Response | null {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
