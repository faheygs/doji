import { create } from 'zustand';
import type { UserEvent, Challenge, Post } from '../types/database';

type ChallengeStatus = 'idle' | 'pending' | 'active' | 'completed' | 'missed';

type ChallengeState = {
  currentUserEvent: UserEvent | null;
  currentChallenge: Challenge | null;
  status: ChallengeStatus;
  capturedPhoto: string | null;
  capturedFrontPhoto: string | null;
  capturedVideoUri: string | null;

  setCurrentUserEvent: (event: UserEvent | null) => void;
  setCurrentChallenge: (challenge: Challenge | null) => void;
  setStatus: (status: ChallengeStatus) => void;
  setCapturedPhoto: (uri: string | null) => void;
  setCapturedFrontPhoto: (uri: string | null) => void;
  setCapturedVideoUri: (uri: string | null) => void;
  clearCaptures: () => void;
};

export const useChallengeStore = create<ChallengeState>((set) => ({
  currentUserEvent: null,
  currentChallenge: null,
  status: 'idle',
  capturedPhoto: null,
  capturedFrontPhoto: null,
  capturedVideoUri: null,

  setCurrentUserEvent: (currentUserEvent) => set({ currentUserEvent }),
  setCurrentChallenge: (currentChallenge) => set({ currentChallenge }),
  setStatus: (status) => set({ status }),
  setCapturedPhoto: (capturedPhoto) => set({ capturedPhoto }),
  setCapturedFrontPhoto: (capturedFrontPhoto) => set({ capturedFrontPhoto }),
  setCapturedVideoUri: (capturedVideoUri) => set({ capturedVideoUri }),
  clearCaptures: () =>
    set({ capturedPhoto: null, capturedFrontPhoto: null, capturedVideoUri: null }),
}));
