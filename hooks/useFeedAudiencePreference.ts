import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedAudience } from '../lib/feedAudience';
import {
  readFeedAudiencePreference,
  writeFeedAudiencePreference,
} from '../lib/feedAudiencePreference';

export function useFeedAudiencePreference(userId: string | undefined) {
  const [audience, setAudience] = useState<FeedAudience>('everyone');
  const explicitlyChosen = useRef(false);

  useEffect(() => {
    explicitlyChosen.current = false;
    if (!userId) {
      setAudience('everyone');
      return;
    }
    let disposed = false;
    void readFeedAudiencePreference(userId).then((stored) => {
      if (!disposed && !explicitlyChosen.current) setAudience(stored);
    });
    return () => { disposed = true; };
  }, [userId]);

  const selectAudience = useCallback((next: FeedAudience) => {
    explicitlyChosen.current = true;
    setAudience(next);
    if (userId) void writeFeedAudiencePreference(userId, next);
  }, [userId]);

  return { audience, selectAudience };
}
