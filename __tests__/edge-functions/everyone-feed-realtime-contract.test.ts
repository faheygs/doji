import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260921120000_align_everyone_feed_membership_realtime.sql',
  ),
  'utf8',
);

describe('Everyone feed realtime membership contract', () => {
  it('publishes every non-demo post membership change to the public feed channel', () => {
    expect(sql).toContain("when tg_op = 'INSERT' then not coalesce(new.is_demo, false)");
    expect(sql).toContain("when tg_op = 'DELETE' then not coalesce(old.is_demo, false)");
    expect(sql).toContain("'feed:public', event_name");
    expect(sql).not.toContain("community or visibility = 'public'");
  });

  it('keeps engagement changes on bounded post channels', () => {
    expect(sql).toContain("'post:' || post_id::text, event_name");
    expect(sql).toContain("tg_table_name = 'posts'");
    expect(sql).toContain("to_jsonb(new) - 'reaction_count' - 'comment_count' - 'updated_at'");
  });
});
