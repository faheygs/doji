import type { Env } from './index';

export async function expirePushFanout(env: Env, dailyEventId: string): Promise<void> {
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/fanout-doji-push`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
    },
    body: JSON.stringify({ dailyEventId, expire: true }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Expiring Doji push fanout failed: ${response.status} ${await response.text()}`);
  }
}
