import { useEffect, useMemo, useRef, useState } from 'react';
import type { Post } from '../types/database';
import { feedPostNeedsPreparation, feedPostPreparationKey } from '../lib/feedPostPreparation';
import { createFeedPreparationQueue } from '../lib/feedPreparationQueue';

/**
 * Existing query/cache rows render immediately. Only genuinely new head inserts
 * are briefly held for media readiness with a bounded fallback. A cold feed
 * never waits for every photo in the page.
 */
export function usePreparedFeedPosts(
  latestPosts: Post[],
  feedIdentity: string,
  enabled: boolean,
  baselineReady: boolean,
) {
  const identityRef = useRef('');
  const baselineEstablishedRef = useRef(false);
  const admittedIdsRef = useRef(new Set<string>());
  const preparedRef = useRef(new Map<string, Post>());
  const mountedRef = useRef(true);
  const [revision, setRevision] = useState(0);
  const queueRef = useRef<ReturnType<typeof createFeedPreparationQueue> | null>(null);
  if (!queueRef.current) {
    queueRef.current = createFeedPreparationQueue((post, prepared) => {
      if (!mountedRef.current) return;
      if (prepared) preparedRef.current.set(feedPostPreparationKey(post), prepared);
      admittedIdsRef.current.add(post.id);
      setRevision((value) => value + 1);
    });
  }
  const queue = queueRef.current;
  const preparationIdentity = useMemo(
    () => latestPosts.map(feedPostPreparationKey).join('|'),
    [latestPosts],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queue.reset();
    };
  }, [queue]);

  useEffect(() => {
    identityRef.current = feedIdentity;
    baselineEstablishedRef.current = false;
    admittedIdsRef.current.clear();
    preparedRef.current.clear();
    queue.reset();
    setRevision((value) => value + 1);
  }, [enabled, feedIdentity, queue]);

  useEffect(() => {
    if (!enabled || !baselineReady || identityRef.current !== feedIdentity) return;

    const liveIds = new Set(latestPosts.map((post) => post.id));
    const liveKeys = new Set(latestPosts.map(feedPostPreparationKey));
    queue.retain(liveKeys);
    for (const id of admittedIdsRef.current) {
      if (!liveIds.has(id)) admittedIdsRef.current.delete(id);
    }
    for (const [key, post] of preparedRef.current) {
      if (!liveIds.has(post.id) || !liveKeys.has(key)) preparedRef.current.delete(key);
    }

    // The first authoritative/cache snapshot is already the feed. Never run a
    // page-wide media preload on startup or audience changes.
    if (!baselineEstablishedRef.current) {
      for (const post of latestPosts) admittedIdsRef.current.add(post.id);
      baselineEstablishedRef.current = true;
      setRevision((value) => value + 1);
      return;
    }

    const firstKnownIndex = latestPosts.findIndex((post) => admittedIdsRef.current.has(post.id));
    let admittedSynchronously = false;
    latestPosts.forEach((post, index) => {
      if (admittedIdsRef.current.has(post.id)) return;

      // New realtime rows are inserted at the head. Rows appended after a known
      // item are pagination and must render immediately like the baseline.
      const isHeadInsert = firstKnownIndex < 0 || index < firstKnownIndex;
      if (!isHeadInsert || !feedPostNeedsPreparation(post)) {
        admittedIdsRef.current.add(post.id);
        admittedSynchronously = true;
        return;
      }
      queue.enqueue(post);
    });
    if (admittedSynchronously) setRevision((value) => value + 1);
  }, [baselineReady, enabled, feedIdentity, latestPosts, preparationIdentity, queue]);

  return useMemo(() => {
    // Keep this projection referentially stable between real query/readiness
    // changes. Returning a fresh array on every render makes the downstream
    // stable-feed effect update itself forever.
    void revision;
    if (
      !enabled ||
      !baselineReady ||
      identityRef.current !== feedIdentity ||
      !baselineEstablishedRef.current
    )
      return latestPosts;

    return latestPosts.flatMap((post) => {
      if (!admittedIdsRef.current.has(post.id)) return [];
      const prepared = preparedRef.current.get(feedPostPreparationKey(post));
      if (!prepared) return [post];
      return [
        {
          ...post,
          photo_url: prepared.photo_url,
          front_photo_url: prepared.front_photo_url,
          video_url: prepared.video_url,
        },
      ];
    });
  }, [baselineReady, enabled, feedIdentity, latestPosts, revision]);
}
