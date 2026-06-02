import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { navigateToFeedAfterChallengeComplete } from '../lib/navigationReturn';
import type { XpOverlayPayload } from '../lib/challengeComplete';

export function useChallengeCompleteOverlay() {
  const router = useRouter();
  const [xpOverlay, setXpOverlay] = useState<XpOverlayPayload | null>(null);

  /** Navigate away first; overlay unmounts when this screen blurs (see focus cleanup). */
  const dismissToFeed = useCallback(() => {
    navigateToFeedAfterChallengeComplete(router);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      return () => setXpOverlay(null);
    }, []),
  );

  return { xpOverlay, setXpOverlay, dismissToFeed };
}
