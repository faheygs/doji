import { create } from 'zustand';
import type { UserEvent, ChallengeType } from '../types/database';

interface DemoState {
  activeDemoUserEvent: UserEvent | null;
  demoUserEvents: Partial<Record<ChallengeType, UserEvent>>;
  setActiveDemoUserEvent: (event: UserEvent | null) => void;
  setDemoUserEvents: (events: Partial<Record<ChallengeType, UserEvent>>) => void;
  clearActiveDemoUserEvent: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  activeDemoUserEvent: null,
  demoUserEvents: {},
  setActiveDemoUserEvent: (event) => set({ activeDemoUserEvent: event }),
  setDemoUserEvents: (events) => set({ demoUserEvents: events }),
  clearActiveDemoUserEvent: () => set({ activeDemoUserEvent: null }),
}));
