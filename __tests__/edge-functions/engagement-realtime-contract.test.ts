import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260818250000_restore_engagement_realtime_contract.sql'),
  'utf8',
);

describe('engagement realtime contract', () => {
  it('publishes the canonical event names consumed by mobile clients', () => {
    expect(sql).toContain("'feed.reaction.' || lower(tg_op)");
    expect(sql).toContain("'feed.comment.' || lower(tg_op)");
    expect(sql).toContain("'feed.comment_like.' || lower(tg_op)");
  });

  it('does not broadcast counter-only post updates as feed changes', () => {
    expect(sql).toContain("to_jsonb(new) - 'reaction_count' - 'comment_count' - 'updated_at'");
  });

  it('returns one authoritative engagement snapshot for targeted reconciliation', () => {
    expect(sql).toContain('get_post_engagement_snapshot');
    expect(sql).toContain("'reaction_breakdown'");
    expect(sql).toContain("'my_reactions'");
  });
});
