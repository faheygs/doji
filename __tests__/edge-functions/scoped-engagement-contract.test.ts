import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('audience-scoped engagement contract', () => {
  const migration = read('supabase/migrations/20260821120000_scoped_post_engagement_snapshot.sql');

  it('uses fixed shards for Everyone and bounded exact rows for Friends', () => {
    expect(migration).toContain('get_post_engagement_snapshot_v2');
    expect(migration).toContain("p_audience not in ('friends', 'everyone')");
    expect(migration).toContain('from public.post_reaction_count_shards');
    expect(migration).toContain('from public.post_engagement_shards');
    expect(migration).toContain('friend_ids as');
    expect(migration).toContain('blocked_ids as');
  });

  it('never derives feed totals from partially loaded comment pages', () => {
    const reactionBar = read('components/feed/ReactionBar.tsx');
    const commentsSheet = read('components/feed/PostCommentsSheet.tsx');
    expect(reactionBar).not.toContain('scopedComments?.pages.reduce');
    expect(reactionBar).toContain('const commentDisplayCount = post.comment_count');
    expect(commentsSheet).not.toContain('scopedComments?.pages.reduce');
    expect(commentsSheet).toContain('const displayCommentCount = commentCount');
  });

  it('does not write global reaction command totals into every feed scope', () => {
    const mutation = read('hooks/useToggleReaction.ts');
    expect(mutation).toContain("audience === 'everyone' ? patchGlobal : patchViewerState");
    expect(mutation).toContain('variables.feedAudience');
  });

  it('uses a notification post id as a targeted ordering safety net', () => {
    const domainRealtime = read('lib/domainRealtimeHandler.ts');
    expect(domainRealtime).toContain('refreshActivePostEngagement(queryClient, postId)');
    expect(domainRealtime).toContain('query.queryKey[1] === postId');
  });
});
