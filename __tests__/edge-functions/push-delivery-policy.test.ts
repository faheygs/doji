import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('terminal push delivery policy', () => {
  const migration = read('supabase/migrations/20260815205000_terminal_push_delivery.sql');
  const relay = read('supabase/functions/relay-domain-events/index.ts');
  const broadcast = read('supabase/functions/_shared/broadcast-push.ts');
  const fanout = read('supabase/functions/fanout-doji-push/index.ts');

  it('makes direct and batch claims insert-only', () => {
    expect(migration.match(/on conflict \(delivery_key\) do nothing/g)).toHaveLength(2);
    expect(migration).not.toContain('attempts = public.push_delivery_claims.attempts + 1');
  });

  it('does not retry a direct Expo handoff inline', () => {
    expect(relay).not.toContain('MAX_INLINE_ATTEMPTS');
    expect(relay).not.toContain('complete_push_deliveries_batch');
    expect(relay).toContain('recordPushDeliveryResults');
  });

  it('treats broadcast outcome writes as telemetry instead of resend permission', () => {
    expect(broadcast).not.toContain('complete_push_deliveries_batch');
    expect(broadcast).toContain('recordPushDeliveryResults');
  });

  it('uses bounded provider lifetimes', () => {
    expect(relay).toContain('getPushExpiresAtMs(event)');
    expect(broadcast).toContain('getPushExpiresAtMs(event)');
    expect(relay).toContain('Math.ceil((pushExpiresAtMs - Date.now()) / 1000)');
    expect(broadcast).toContain('Math.ceil((expiresAtMs - Date.now()) / 1000)');
  });

  it('makes every native Doji-live alert explicitly urgent about the 10-minute window', () => {
    expect(fanout).toContain('const DOJI_LIVE_PUSH_TITLE = "It\'s time to Doji!"');
    expect(fanout).toContain("const DOJI_LIVE_PUSH_BODY = 'You only have 10 minutes ⚠️'");
    expect(fanout).not.toContain("claim.title ?? 'It\\'s time to Doji!'");
    expect(broadcast).toContain('const DOJI_LIVE_PUSH_TITLE = "It\'s time to Doji!"');
    expect(broadcast).toContain("const DOJI_LIVE_PUSH_BODY = 'You only have 10 minutes ⚠️'");
    expect(broadcast).toContain('title: DOJI_LIVE_PUSH_TITLE');
  });
});
