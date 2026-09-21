import { useEffect, useMemo, useRef, useState } from 'react';
import type { Post } from '../types/database';
import {
  FEED_POST_PREPARATION_TIMEOUT_MS,
  feedPostNeedsPreparation,
  feedPostPreparationKey,
  prepareFeedPostMedia,
} from '../lib/feedPostPreparation';

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

  useEffect(
    () => () => {
      mountedRef.current = false;
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

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

    for (const post of pending) {
      const key = feedPostPreparationKey(post);
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
    }

    void prepareFeedPostMedia(pending)
      .then((prepared) => {
        for (const post of pending) {
          const key = feedPostPreparationKey(post);
          const ready = prepared.get(key);
          if (ready) {
            const timer = timersRef.current.get(key);
            if (timer) clearTimeout(timer);
            timersRef.current.delete(key);
            preparedRef.current.set(key, ready);
            fallbackRef.current.delete(key);
          }
          preparingRef.current.delete(key);
        }
        if (mountedRef.current && prepared.size > 0) setRevision((value) => value + 1);
      })
      .catch(() => {
        // Per-post timeout below owns the visible fallback and retry boundary.
      });
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
