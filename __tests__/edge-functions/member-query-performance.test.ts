import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const candidate = read('docs/drafts/member_query_performance_v1.sql');
const baseline = read('supabase/migrations/20260909223000_friendship_time_scoped_activity.sql');
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('member query performance candidate boundaries', () => {
  it('keeps the released migration identical to the qualified query bodies', () => {
    const release = read('supabase/migrations/20260928040200_repair_member_query_performance.sql');
    expect(normalize(release.slice(release.indexOf('begin;')))).toBe(normalize(candidate.slice(candidate.indexOf('begin;'))));
    for (const [version, table] of [['20260928040000', 'comments'], ['20260928040100', 'reactions']]) {
      const index = read(`supabase/migrations/${version}_${table}_author_created_idx.sql`);
      expect(index).toContain(`create index concurrently ${table}_author_created_idx on public.${table}(user_id, created_at desc);`);
      expect(index).not.toMatch(/^begin;/m);
    }
  });
  it('changes only the two measured functions, without permissions or producer changes', () => {
    expect([...candidate.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      'sync_comment_mentions', 'get_notification_center_snapshot_without_post_context',
    ]);
    expect(candidate).not.toMatch(/\b(grant|revoke|alter policy|create trigger|enqueue_domain_event)\b/i);
    expect(candidate).toContain('Query baseline changed; review before applying');
    expect(candidate).toContain('Recipient index definition mismatch');
  });

  it('preserves all output branches, grouping, limits and priority rules', () => {
    const output = (sql: string) => normalize(sql.slice(sql.indexOf('), all_items as ('), sql.indexOf('$$;', sql.indexOf('), all_items as ('))));
    expect(output(candidate)).toBe(output(baseline));
    expect(candidate).toContain('reaction_ids as materialized');
    expect(candidate).toContain('comment_ids as materialized');
    expect(candidate).toContain('from comment_ids candidate join public.comments c on c.id = candidate.id');
    expect(candidate).toContain('and c.created_at >= f.accepted_at');
  });

  it('keeps empty-text cleanup outside parsing and retains unchanged mention identities', () => {
    const helper = candidate.slice(candidate.indexOf('create or replace function public.sync_comment_mentions'), candidate.indexOf('create or replace function public.get_notification'));
    expect(helper).toContain("eligible_ids uuid[] := '{}'::uuid[]");
    expect(helper).toContain('p.id = any(candidate_ids)');
    expect(helper).toContain('lower(p.username) = any(names)');
    expect(helper).toContain('end if;\n\n  -- Empty text');
    expect(helper).toContain('and not (m.mentioned_user_id = any(eligible_ids))');
    expect(helper).toContain('on conflict(comment_id, mentioned_user_id) do nothing');
  });
});
