import { useEffect, useMemo, useRef, useState } from 'react';
import type { Post } from '../types/database';
import {
  FEED_POST_PREPARATION_TIMEOUT_MS,
  feedPostNeedsPreparation,
  feedPostPreparationKey,
  prepareFeedPostMedia,
} from '../lib/feedPostPreparation';

const FEED_POST_PREPARATION_CONCURRENCY = 2;

/**
 * Keep media posts out of feed presentation until their primary media has been
 * authorized, downloaded, and decoded. A bounded fallback prevents one broken
 * object from permanently blocking pagination or the rest of the feed.
 */
export function usePreparedFeedPosts(latestPosts: Post[], enabled: boolean) {
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
    if (!enabled) return;
    const liveKeys = new Set(latestPosts.map(feedPostPreparationKey));
    for (const key of preparedRef.current.keys()) {
      if (!liveKeys.has(key)) preparedRef.current.delete(key);
    }
    for (const key of fallbackRef.current) {
      if (!liveKeys.has(key)) fallbackRef.current.delete(key);
    }

    const pending = latestPosts.filter((post) => {
      if (!feedPostNeedsPreparation(post)) return false;
      const key = feedPostPreparationKey(post);
      return (
        !preparedRef.current.has(key) &&
        !fallbackRef.current.has(key) &&
        !preparingRef.current.has(key)
      );
    });
    if (pending.length === 0) return;

    let cursor = 0;
    const prepareNext = async () => {
      while (cursor < pending.length) {
        const post = pending[cursor++];
        const key = feedPostPreparationKey(post);
        // A newer effect may already have claimed this post while this worker
        // was waiting for a previous item.
        if (
          preparedRef.current.has(key) ||
          fallbackRef.current.has(key) ||
          preparingRef.current.has(key)
        ) {
          continue;
        }
        preparingRef.current.add(key);
        timersRef.current.set(
          key,
          setTimeout(() => {
            timersRef.current.delete(key);
            fallbackRef.current.add(key);
            preparingRef.current.delete(key);
            if (mountedRef.current) setRevision((value) => value + 1);
          }, FEED_POST_PREPARATION_TIMEOUT_MS),
        );

        try {
          // Prepare independently so the first ready card can render without
          // waiting for every image on the page. Keeping only two native
          // decodes active also prevents large photo bursts from exhausting
          // handset memory and tripping the app-level error boundary.
          const prepared = await prepareFeedPostMedia([post]);
          const ready = prepared.get(key);
          if (ready) {
            const timer = timersRef.current.get(key);
            if (timer) clearTimeout(timer);
            timersRef.current.delete(key);
            preparedRef.current.set(key, ready);
            fallbackRef.current.delete(key);
          }
        } catch {
          // The bounded fallback timer owns recovery for this single post.
        } finally {
          preparingRef.current.delete(key);
          if (mountedRef.current) setRevision((value) => value + 1);
        }
      }
    };

    void Promise.all(
      Array.from(
        { length: Math.min(FEED_POST_PREPARATION_CONCURRENCY, pending.length) },
        () => prepareNext(),
      ),
    );
  }, [enabled, latestPosts, preparationIdentity]);

  const posts = (() => {
    // Reading the revision intentionally recomputes this ref-backed projection
    // after an asynchronous preparation or timeout completes.
    void revision;
    if (!enabled) return latestPosts;
    return latestPosts.flatMap((post) => {
      if (!feedPostNeedsPreparation(post)) return [post];
      const key = feedPostPreparationKey(post);
      const prepared = preparedRef.current.get(key);
      if (prepared) {
        // Keep all fresh counters/copy from the authoritative query while using
        // the already-decoded media references from preparation.
        return [
          {
            ...post,
            photo_url: prepared.photo_url,
            front_photo_url: prepared.front_photo_url,
            video_url: prepared.video_url,
          },
        ];
      }
      return fallbackRef.current.has(key) ? [post] : [];
    });
  })();

  return {
    posts,
    isPreparing: enabled && posts.length < latestPosts.length,
  };
}
