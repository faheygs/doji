import fs from 'fs';
import path from 'path';

const initial = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260920150000_server_announcements.sql'),
  'utf8',
);
const scaled = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260920151000_scale_announcement_claims.sql'),
  'utf8',
);

describe('server announcement contract', () => {
  it('denies direct client table access and exposes narrow authenticated RPCs', () => {
    expect(initial).toContain('revoke all on public.app_announcements from anon, authenticated');
    expect(initial).toContain('grant execute on function public.claim_active_app_announcement() to authenticated');
    expect(initial).toContain('grant execute on function public.record_app_announcement_action(uuid, text) to authenticated');
  });

  it('enforces schedule, per-user caps, and durable dismissal server-side', () => {
    expect(initial).toContain('announcement.starts_at <= now()');
    expect(initial).toContain('receipt.impression_count, 0) < announcement.max_impressions_per_user');
    expect(initial).toContain('receipt.dismissed_at is null');
  });

  it('serializes only one account and never locks the shared campaign row', () => {
    expect(scaled).toContain('pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0))');
    expect(scaled).not.toContain('for update of announcement');
    expect(scaled).not.toContain('skip locked');
  });
});
