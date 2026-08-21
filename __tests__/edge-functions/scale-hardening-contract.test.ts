import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('100k hardening contracts', () => {
  it('serves engagement totals from fixed shards instead of regrouping reactions', () => {
    const migration = read(
      'supabase/migrations/20260818300000_bounded_engagement_snapshots.sql',
    ).toLowerCase();
    expect(migration).toContain('from public.post_engagement_shards');
    expect(migration).toContain('from public.post_reaction_count_shards');
    expect(migration).not.toMatch(
      /from public\.reactions reaction\s+where reaction\.post_id = p_post_id\s+group by/,
    );
  });

  it('enforces actor-owned write budgets and coalesces a shared poll channel', () => {
    const migration = read(
      'supabase/migrations/20260818310000_write_rate_limits_and_poll_coalescing.sql',
    ).toLowerCase();
    expect(migration).toContain('api_rate_limit_buckets');
    expect(migration).toContain('enforce_reaction_write_rate');
    expect(migration).toContain('enforce_comment_write_rate');
    expect(migration).toContain("effective_key := 'coalesce:post-poll:'");
  });

  it('continues bounded maintenance while a backlog remains', () => {
    const worker = read('infra/doji-orchestrator/src/index.ts');
    expect(worker).toContain('class DataMaintenanceAlarm');
    expect(worker).toContain('if (result.hasMore)');
    expect(worker).toContain('scheduleDataMaintenance(this.env)');
  });

  it('keeps free reads now and exposes one scale-read configuration boundary', () => {
    const gateway = read('lib/scaleReadGateway.ts');
    expect(gateway).toContain('EXPO_PUBLIC_SCALE_READ_URL');
    expect(gateway).toContain('if (!scaleReadUrl) return directRead()');
  });

  it('keeps leaderboard reads bounded without ever dropping the viewer', () => {
    const migration = read(
      'supabase/migrations/20260818340000_always_include_viewer_in_leaderboard.sql',
    ).toLowerCase();
    expect(migration).toContain("p_audience = 'everyone' or profile.id = uid");
    expect(migration).toContain('select * from viewer_row viewer');
    expect(migration).toContain('not exists (select 1 from top_rows');
  });

  it('keeps Everyone standings symmetric instead of honoring obsolete demo markers', () => {
    const migration = read(
      'supabase/migrations/20260820040000_symmetric_leaderboard_visibility.sql',
    ).toLowerCase();
    expect(migration).toContain("p_audience = 'everyone' or profile.id = uid");
    expect(migration).toContain('coalesce(profile.is_banned, false) = false');
    expect(migration).not.toContain('and coalesce(profile.is_demo_account, false) = false');
    expect(migration).toContain("and lower(username) <> 'reviewer'");
  });
});
