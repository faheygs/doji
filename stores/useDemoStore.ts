import { create } from 'zustand';
import type { ChallengeType, UserEventStatus, Post } from '../types/database';
import { DEMO_FEED_POSTS_BY_TYPE } from '../constants/demoData';

interface DemoState {
  isDemoMode: boolean;
  demoChallengeType: ChallengeType;
  demoStatus: UserEventStatus;
  demoFeedPosts: Post[];
  demoFeedVersion: number;
  enterDemoMode: (type?: ChallengeType) => void;
  exitDemoMode: () => void;
  setDemoChallengeType: (type: ChallengeType) => void;
  completeDemoChallenge: () => void;
  addDemoPost: (post: Post) => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemoMode: false,
  demoChallengeType: 'photo',
  demoStatus: 'pending',
  demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE.photo,
  demoFeedVersion: 0,
  enterDemoMode: (type = 'photo') =>
    set({
      isDemoMode: true,
      demoChallengeType: type,
      demoStatus: 'pending',
      demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE[type],
      demoFeedVersion: 1,
    }),
  exitDemoMode: () =>
    set({
      isDemoMode: false,
      demoChallengeType: 'photo',
      demoStatus: 'pending',
      demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE.photo,
      demoFeedVersion: 0,
    }),
  setDemoChallengeType: (type) =>
    set((s) => ({
      demoChallengeType: type,
      // Keep demoStatus as-is — switching type only updates the feed.
      // Resetting to 'pending' here caused the ChallengeBanner to appear
      // right under the type chip on layout shift, triggering accidental navigation.
      demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE[type],
      demoFeedVersion: s.demoFeedVersion + 1,
    })),
  completeDemoChallenge: () => set({ demoStatus: 'completed' }),
  addDemoPost: (post) =>
    set((s) => ({
      demoFeedPosts: [post, ...s.demoFeedPosts],
      demoFeedVersion: s.demoFeedVersion + 1,
    })),
}));
