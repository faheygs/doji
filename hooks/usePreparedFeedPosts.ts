import { useEffect, useMemo, useRef, useState } from 'react';
import type { Post } from '../types/database';
import {
  FEED_POST_PREPARATION_TIMEOUT_MS,
  feedPostNeedsPreparation,
  feedPostPreparationKey,
  prepareFeedPostMedia,
} from '../lib/feedPostPreparation';

const NEW_POST_PREPARATION_CONCURRENCY = 2;

/**
 * Existing query/cache rows render immediately. Only genuinely new head inserts
 * are held until their media is ready, so realtime never exposes a black card
 * and a cold feed never waits for every photo in the page.
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
  const preparingRef = useRef(new Set<string>());
  const fallbackRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mountedRef = useRef(true);
  const [revision, setRevision] = useState(0);
  const preparationIdentity = useMemo(
    () => latestPosts.map(feedPostPreparationKey).join('|'),
    [latestPosts],
  );

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    identityRef.current = feedIdentity;
    baselineEstablishedRef.current = false;
    admittedIdsRef.current.clear();
    preparedRef.current.clear();
    preparingRef.current.clear();
    fallbackRef.current.clear();
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    setRevision((value) => value + 1);
  }, [feedIdentity]);

  useEffect(() => {
    if (!enabled || !baselineReady || identityRef.current !== feedIdentity) return;

    const liveIds = new Set(latestPosts.map((post) => post.id));
    for (const id of admittedIdsRef.current) {
      if (!liveIds.has(id)) admittedIdsRef.current.delete(id);
    }
    for (const [key, post] of preparedRef.current) {
      if (!liveIds.has(post.id)) preparedRef.current.delete(key);
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
    const pending: Post[] = [];
    let admittedSynchronously = false;
    latestPosts.forEach((post, index) => {
      if (admittedIdsRef.current.has(post.id) || preparingRef.current.has(post.id)) return;

      // New realtime rows are inserted at the head. Rows appended after a known
      // item are pagination and must render immediately like the baseline.
      const isHeadInsert = firstKnownIndex < 0 || index < firstKnownIndex;
      if (!isHeadInsert || !feedPostNeedsPreparation(post)) {
        admittedIdsRef.current.add(post.id);
        admittedSynchronously = true;
        return;
      }
      pending.push(post);
    });

    if (pending.length === 0) {
      if (admittedSynchronously) setRevision((value) => value + 1);
      return;
    }
    if (admittedSynchronously) setRevision((value) => value + 1);

    let cursor = 0;
    const prepareNext = async () => {
      while (cursor < pending.length) {
        const post = pending[cursor++];
        const key = feedPostPreparationKey(post);
        if (admittedIdsRef.current.has(post.id) || preparingRef.current.has(post.id)) continue;

        preparingRef.current.add(post.id);
        timersRef.current.set(
          post.id,
          setTimeout(() => {
            timersRef.current.delete(post.id);
            fallbackRef.current.add(post.id);
            admittedIdsRef.current.add(post.id);
            preparingRef.current.delete(post.id);
            if (mountedRef.current) setRevision((value) => value + 1);
          }, FEED_POST_PREPARATION_TIMEOUT_MS),
        );

        try {
          const prepared = await prepareFeedPostMedia([post]);
          const ready = prepared.get(key);
          if (ready) {
            const timer = timersRef.current.get(post.id);
            if (timer) clearTimeout(timer);
            timersRef.current.delete(post.id);
            preparedRef.current.set(key, ready);
            fallbackRef.current.delete(post.id);
            admittedIdsRef.current.add(post.id);
          }
        } catch {
          // The bounded per-post fallback owns recovery.
        } finally {
          preparingRef.current.delete(post.id);
          if (mountedRef.current) setRevision((value) => value + 1);
        }
      }
    };

    void Promise.all(
      Array.from(
        { length: Math.min(NEW_POST_PREPARATION_CONCURRENCY, pending.length) },
        () => prepareNext(),
      ),
    );
  }, [baselineReady, enabled, feedIdentity, latestPosts, preparationIdentity]);

  return useMemo(() => {
    // Keep this projection referentially stable between real query/readiness
    // changes. Returning a fresh array on every render makes the downstream
    // stable-feed effect update itself forever.
    void revision;
    if (!enabled || !baselineReady || !baselineEstablishedRef.current) return latestPosts;

    return latestPosts.flatMap((post) => {
      if (!admittedIdsRef.current.has(post.id)) return [];
      const prepared = preparedRef.current.get(feedPostPreparationKey(post));
      if (!prepared) return [post];
      return [{
        ...post,
        photo_url: prepared.photo_url,
        front_photo_url: prepared.front_photo_url,
        video_url: prepared.video_url,
      }];
    });
  }, [baselineReady, enabled, latestPosts, revision]);
}
