import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { navigateToFeedAfterChallengeComplete } from '../lib/navigationReturn';
import type { XpOverlayPayload } from '../lib/challengeComplete';

export function useChallengeCompleteOverlay() {
  const router = useRouter();
  const [xpOverlay, setXpOverlay] = useState<XpOverlayPayload | null>(null);

  const dismissToFeed = useCallback(() => {
    setXpOverlay(null);
    navigateToFeedAfterChallengeComplete(router);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      return () => setXpOverlay(null);
    }, []),
  );

  return { xpOverlay, setXpOverlay, dismissToFeed };
}
