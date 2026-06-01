import { create } from 'zustand';
import type { BadgeTierName } from '../constants/theme';

export type BadgeCelebrationPayload = {
  categoryId: string;
  name: string;
  tier: BadgeTierName;
  unlockedTiers: BadgeTierName[];
};

type CelebrationState = {
  badge: BadgeCelebrationPayload | null;
  showBadgeUnlock: (payload: BadgeCelebrationPayload) => void;
  dismissBadgeUnlock: () => void;
};

export const useCelebrationStore = create<CelebrationState>((set) => ({
  badge: null,
  showBadgeUnlock: (payload) => set({ badge: payload }),
  dismissBadgeUnlock: () => set({ badge: null }),
}));
