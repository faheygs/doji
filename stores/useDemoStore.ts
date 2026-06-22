import { create } from 'zustand';
import type { ChallengeType, UserEventStatus } from '../types/database';

interface DemoState {
  isDemoMode: boolean;
  demoChallengeType: ChallengeType;
  demoStatus: UserEventStatus;
  enterDemoMode: (type?: ChallengeType) => void;
  exitDemoMode: () => void;
  setDemoChallengeType: (type: ChallengeType) => void;
  completeDemoChallenge: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemoMode: false,
  demoChallengeType: 'photo',
  demoStatus: 'pending',
  enterDemoMode: (type = 'photo') =>
    set({ isDemoMode: true, demoChallengeType: type, demoStatus: 'pending' }),
  exitDemoMode: () =>
    set({ isDemoMode: false, demoChallengeType: 'photo', demoStatus: 'pending' }),
  setDemoChallengeType: (type) =>
    set({ demoChallengeType: type, demoStatus: 'pending' }),
  completeDemoChallenge: () => set({ demoStatus: 'completed' }),
}));
