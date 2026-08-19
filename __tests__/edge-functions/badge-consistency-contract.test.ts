import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260818290000_consistent_badges_and_reaction_updates.sql',
  ),
  'utf8',
).toLowerCase();

describe('badge consistency database contract', () => {
  it('derives tiers from one canonical metric evaluator', () => {
    expect(migration).toContain('function public.badge_metric_value');
    expect(migration).toContain('from public.badge_tiers');
    expect(migration).toContain('function public.sync_badge_category');
  });

  it('covers every mutable tier source with targeted triggers', () => {
    expect(migration).toContain('create trigger sync_profile_badges');
    expect(migration).toContain('create trigger sync_poll_badge');
    expect(migration).toContain('create trigger sync_friend_badges');
    expect(migration).toContain('create trigger sync_suggestion_badges');
  });

  it('repairs reaction emoji shards and historical badge omissions', () => {
    expect(migration).toContain('create trigger reaction_emoji_shard_update');
    expect(migration).toContain('delete from public.post_reaction_count_shards');
    expect(migration).toContain('perform public.sync_all_badges_for_user');
  });
});
