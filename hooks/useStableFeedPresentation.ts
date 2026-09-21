import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { Post } from '../types/database';
import { stabilizeFeedPosts } from '../lib/stableFeed';

export function useStableFeedPresentation(
  latestPosts: Post[],
  identity: string,
  scrollToTop: () => void,
) {
  const identityRef = useRef('');
  const visibleRef = useRef<Post[]>([]);
  const awayFromTopRef = useRef(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pendingNewPostCount, setPendingNewPostCount] = useState(0);

  useEffect(() => {
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      visibleRef.current = latestPosts;
      setPosts(latestPosts);
      setPendingNewPostCount(0);
      awayFromTopRef.current = false;
      return;
    }
    const result = stabilizeFeedPosts(
      latestPosts,
      visibleRef.current.map((post) => post.id),
      awayFromTopRef.current,
    );
    visibleRef.current = result.posts;
    setPosts(result.posts);
    setPendingNewPostCount(result.withheldIds.length);
  }, [identity, latestPosts]);

  const revealNewPosts = useCallback(() => {
    visibleRef.current = latestPosts;
    setPosts(latestPosts);
    setPendingNewPostCount(0);
    awayFromTopRef.current = false;
    scrollToTop();
  }, [latestPosts, scrollToTop]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const away = event.nativeEvent.contentOffset.y > 48;
    if (awayFromTopRef.current === away) return;
    awayFromTopRef.current = away;
    if (!away && pendingNewPostCount > 0) revealNewPosts();
  }, [pendingNewPostCount, revealNewPosts]);

  return { posts, pendingNewPostCount, revealNewPosts, onScroll };
}
