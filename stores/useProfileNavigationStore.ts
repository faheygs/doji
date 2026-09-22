import { create } from 'zustand';

type ProfileNavigationState = {
  pendingUsername: string | null;
  begin: (username: string) => void;
  clear: () => void;
};

export const useProfileNavigationStore = create<ProfileNavigationState>((set) => ({
  pendingUsername: null,
  begin: (username) => set({ pendingUsername: username }),
  clear: () => set({ pendingUsername: null }),
}));
