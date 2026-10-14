import { useAuthStore } from '../../stores/useAuthStore';
import { supabase } from '../../lib/supabase';
import { mergeNotificationPreferences } from '../../lib/notificationPreferences';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { closeRealtimeConnection } from '../../lib/realtimeClient';
import { getAuthGate } from '../../lib/authRoute';
import React, { useState } from 'react';
import { Platform, Text } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Picker from 'expo-image-picker';
import { useProfilePhotoPicker } from '../../hooks/useProfilePhotoPicker';
import { useAuthGate } from '../../hooks/useAuthGate';
import type { AppDialogOptions } from '../../components/ui/AppDialog';

jest.mock('../../lib/supabase');
jest.mock('../../lib/realtimeClient', () => ({ closeRealtimeConnection: jest.fn() }));
const mockShowDialog = jest.fn();
jest.mock('../../contexts/DialogContext', () => ({ useAppDialog: () => ({ showDialog: mockShowDialog }) }));
jest.mock('expo-image-picker', () => ({
  getPendingResultAsync: jest.fn(() => Promise.resolve(null)),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const originalOS = Platform.OS;

/** Build a chain that handles both the initial select and any subsequent update. */
function makeChain(data: unknown, error: unknown = null) {
  const chain: Record<string, jest.Mock> = {};
  ['select', 'update', 'eq', 'abortSignal'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error });
  return chain;
}

function makeRpcChain(data: unknown, error: unknown = null) {
  return {
    abortSignal: jest.fn().mockResolvedValue({ data, error }),
  };
}

describe('useAuthStore', () => {
  afterEach(() => { cleanup(); Platform.OS = originalOS; });
  beforeEach(() => {
    useAuthStore.setState({
      session: null,
      profile: null,
      isLoading: true,
      isProfileLoading: false,
      profileLoadState: 'idle',
    });
    jest.clearAllMocks();
  });

  describe('setSession', () => {
    it('updates session state', () => {
      const mockSession = { user: { id: 'user-1' }, access_token: 'token' } as any;
      useAuthStore.getState().setSession(mockSession);
      expect(useAuthStore.getState().session).toBe(mockSession);
      expect(closeRealtimeConnection).toHaveBeenCalledTimes(1);
    });

    it('recreates realtime when the authenticated account changes', () => {
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      useAuthStore.getState().setSession({ user: { id: 'user-2' } } as any);

      expect(closeRealtimeConnection).toHaveBeenCalledTimes(1);
    });

    it('keeps realtime connected when only the session token refreshes', () => {
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      useAuthStore.getState().setSession({ user: { id: 'user-1' } } as any);

      expect(closeRealtimeConnection).not.toHaveBeenCalled();
    });

    it('sets session to null', () => {
      useAuthStore.getState().setSession(null);
      expect(useAuthStore.getState().session).toBeNull();
    });
  });

  describe('setProfile', () => {
    it('updates profile state', () => {
      const mockProfile = { id: 'user-1', username: 'john' } as any;
      useAuthStore.getState().setProfile(mockProfile);
      expect(useAuthStore.getState().profile).toBe(mockProfile);
    });
  });

  describe('setLoading', () => {
    it('employee session skips every member profile read and clears cached member presentation', async () => {
      useAuthStore.setState({ session: { user: { id: 'employee', role: 'doji_employee' } } as any,
        profile: { id: 'old-member' } as any, isProfileLoading: true });
      await useAuthStore.getState().fetchProfile('employee');
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(useAuthStore.getState()).toMatchObject({ profile: null, isLoading: false, isProfileLoading: false });
    });
    it('updates loading state', () => {
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('signOut', () => {
    it('calls supabase signOut and clears state', async () => {
      (supabase.auth.signOut as jest.Mock).mockResolvedValue({});
      useAuthStore.setState({
        session: { user: { id: 'u1' } } as any,
        profile: { id: 'u1' } as any,
      });

      await useAuthStore.getState().signOut();

      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(useAuthStore.getState().session).toBeNull();
      expect(useAuthStore.getState().profile).toBeNull();
    });
  });

  describe('fetchProfile', () => {
    it.each([
      ['Take a picture', true], ['Take a picture', false],
      ['Select a photo', true], ['Select a photo', false],
    ] as const)('retains the signup photo from %s when picker finishes before refresh: %s', async (label, photoFirst) => {
      Platform.OS = 'android';
      useAuthStore.setState({ session: { user: { id: 'new-member' } } as any,
        profile: null, isLoading: false, profileLoadState: 'missing' });
      let finishPhoto!: (value: Picker.ImagePickerResult) => void;
      const launch = label === 'Take a picture' ? Picker.launchCameraAsync : Picker.launchImageLibraryAsync;
      jest.mocked(launch).mockReturnValueOnce(new Promise(resolve => { finishPhoto = resolve; }));
      let finishRead!: (value: unknown) => void;
      mockRpc.mockReturnValue({ abortSignal: jest.fn(() => new Promise(resolve => { finishRead = resolve; })) });
      let mounts = 0;
      function SignupDraft() {
        const [uri, setUri] = useState(() => { mounts += 1; return ''; });
        const choose = useProfilePhotoPicker(setUri);
        return React.createElement(Text, { onPress: choose, testID: 'photo' }, uri || 'Choose');
      }
      function SignupGate() {
        return useAuthGate().canUseAuthGroup ? React.createElement(SignupDraft) : null;
      }
      const ui = render(React.createElement(SignupGate));
      fireEvent.press(ui.getByTestId('photo'));
      await act(async () => {
        const dialog = mockShowDialog.mock.calls.at(-1)?.[0] as AppDialogOptions;
        dialog.actions.find(action => action.label === label)?.onPress?.();
      });
      let refresh!: Promise<void>;
      await act(async () => { refresh = useAuthStore.getState().fetchProfile('new-member'); });
      await waitFor(() => expect(finishRead).toBeDefined());
      const photo: Picker.ImagePickerResult = { canceled: false,
        assets: [{ uri: 'file:///synthetic-avatar.jpg', width: 100, height: 100 }] };
      await act(async () => {
        if (photoFirst) finishPhoto(photo);
        else { finishRead({ data: null, error: null }); await refresh; }
      });
      await act(async () => {
        if (photoFirst) { finishRead({ data: null, error: null }); await refresh; }
        else finishPhoto(photo);
      });
      expect(ui.getByText('file:///synthetic-avatar.jpg')).toBeTruthy();
      expect(mounts).toBe(1);
    });

    it.each([503, 403])('signup refresh preserves drafts only for transient failures (%s)', async status => {
      jest.useFakeTimers();
      useAuthStore.setState({ session: { user: { id: 'new-member' } } as any,
        profile: null, isLoading: false, profileLoadState: 'missing' });
      mockRpc.mockReturnValue(makeRpcChain(null, { message: 'Read failed', status }));
      try {
        const pending = useAuthStore.getState().fetchProfile('new-member');
        await jest.advanceTimersByTimeAsync(1_100);
        await pending;
        expect(useAuthStore.getState().profileLoadState).toBe(status === 503 ? 'missing' : 'error');
      } finally { jest.useRealTimers(); }
    });

    it('still routes a confirmed signup to a newly discovered banned profile', async () => {
      useAuthStore.setState({ session: { user: { id: 'new-member' } } as any,
        profile: null, isLoading: false, profileLoadState: 'missing' });
      mockRpc.mockReturnValue(makeRpcChain({ id: 'new-member', username: 'member',
        is_banned: true, onboarding_completed_at: '2026-01-01' }));
      await useAuthStore.getState().fetchProfile('new-member');
      const state = useAuthStore.getState();
      expect(getAuthGate(state.isLoading, state.isProfileLoading, state.session, state.profile,
        state.profileLoadState)).toMatchObject({ canUseAuthGroup: false, canUseApp: false, canUseBannedScreen: true });
    });

    it('does not carry confirmed signup authority into another account', async () => {
      useAuthStore.setState({ session: { user: { id: 'new-member' } } as any,
        profile: null, isLoading: false, profileLoadState: 'missing' });
      useAuthStore.getState().setSession({ user: { id: 'other-member' } } as any);
      const state = useAuthStore.getState();
      expect(getAuthGate(state.isLoading, state.isProfileLoading, state.session, state.profile,
        state.profileLoadState)).toMatchObject({ ready: false, canUseAuthGroup: false, canUseApp: false });
    });

    it('keeps confirmed signup mounted during the camera-return profile refresh', async () => {
      const session = { user: { id: 'new-member' } } as any;
      useAuthStore.setState({ session, profile: null, isLoading: false, profileLoadState: 'missing' });
      let finish!: (value: unknown) => void;
      mockRpc.mockReturnValue({ abortSignal: jest.fn(() => new Promise(resolve => { finish = resolve; })) });
      const gates: ReturnType<typeof getAuthGate>[] = [];
      const unsubscribe = useAuthStore.subscribe(state => gates.push(getAuthGate(
        state.isLoading, state.isProfileLoading, state.session, state.profile, state.profileLoadState,
      )));
      try {
        const pending = useAuthStore.getState().fetchProfile('new-member');
        await waitFor(() => expect(finish).toBeDefined());
        const state = useAuthStore.getState();
        const gate = getAuthGate(state.isLoading, state.isProfileLoading, state.session, state.profile, state.profileLoadState);
        // Resolve before assertions so a failing regression cannot strand the shared request.
        finish({ data: null, error: null });
        await pending;
        expect(gate.canUseAuthGroup).toBe(true);
        expect(gates.every(value => value.canUseAuthGroup && !value.canUseApp)).toBe(true);
        expect(AsyncStorage.getItem).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    });

    it('renders the account-scoped cached profile while the server reconciles', async () => {
      const cached = {
        id: 'user-1', username: 'cached', xp: 10, onboarding_completed_at: '2026-01-01',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(cached));
      let finishRequest: ((value: unknown) => void) | undefined;
      mockRpc.mockReturnValue({
        abortSignal: jest.fn(() => new Promise((resolve) => { finishRequest = resolve; })),
      });
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      const pending = useAuthStore.getState().fetchProfile('user-1');
      await Promise.resolve();
      await Promise.resolve();
      expect(useAuthStore.getState().profile).toMatchObject({ id: 'user-1', username: 'cached' });
      expect(useAuthStore.getState().profileLoadState).toBe('loading');
      expect(useAuthStore.getState().isProfileLoading).toBe(true);

      finishRequest?.({ data: { ...cached, username: 'fresh' }, error: null });
      await pending;
      expect(useAuthStore.getState().profile).toMatchObject({ username: 'fresh' });
    });

    it('fetches profile and updates state', async () => {
      // onboarding_completed_at set → no auto-complete second query
      const mockProfile = {
        id: 'user-1',
        username: 'testuser',
        xp: 100,
        onboarding_completed_at: new Date().toISOString(),
      };
      mockRpc.mockReturnValue(makeRpcChain(mockProfile));
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      await useAuthStore.getState().fetchProfile('user-1');

      expect(mockRpc).toHaveBeenCalledWith('get_own_profile');
      expect(useAuthStore.getState().profile).toMatchObject({
        id: 'user-1',
        username: 'testuser',
        xp: 100,
      });
    });

    it('sets profile to null when not found', async () => {
      mockRpc.mockReturnValue(makeRpcChain(null));
      useAuthStore.setState({ session: { user: { id: 'nonexistent' } } as any });

      await useAuthStore.getState().fetchProfile('nonexistent');
      expect(useAuthStore.getState().profile).toBeNull();
    });

    it('does not throw on error, logs in dev', async () => {
      mockRpc.mockReturnValue(makeRpcChain(null, { message: 'Unauthorized', status: 401 }));
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      await expect(useAuthStore.getState().fetchProfile('user-1')).resolves.not.toThrow();
    });

    it('keeps a previously verified profile usable when a refresh fails', async () => {
      const existing = {
        id: 'user-1',
        username: 'verified',
        onboarding_completed_at: new Date().toISOString(),
      } as any;
      mockRpc.mockReturnValue(makeRpcChain(null, { message: 'Unauthorized', status: 401 }));
      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
        profile: existing,
        profileLoadState: 'ready',
      });

      await useAuthStore.getState().fetchProfile('user-1');

      expect(useAuthStore.getState().profile).toBe(existing);
      expect(useAuthStore.getState().profileLoadState).toBe('ready');
      expect(useAuthStore.getState().isProfileLoading).toBe(false);
    });

    it('retries transient initial failures and authorizes the session when service recovers', async () => {
      jest.useFakeTimers();
      const fresh = {
        id: 'user-1',
        username: 'recovered',
        onboarding_completed_at: new Date().toISOString(),
      };
      mockRpc
        .mockReturnValueOnce(makeRpcChain(null, { message: 'fetch failed', status: 503 }))
        .mockReturnValueOnce(makeRpcChain(null, { message: 'network lost', status: 503 }))
        .mockReturnValueOnce(makeRpcChain(fresh));
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      const pending = useAuthStore.getState().fetchProfile('user-1');
      await jest.advanceTimersByTimeAsync(1_100);
      await pending;

      expect(mockRpc).toHaveBeenCalledTimes(3);
      expect(useAuthStore.getState().profile).toMatchObject({ username: 'recovered' });
      expect(useAuthStore.getState().profileLoadState).toBe('ready');
      jest.useRealTimers();
    });
  });

  describe('updateProfile', () => {
    it('updates profile on server and in state', async () => {
      const updated = { id: 'user-1', username: 'testuser', display_name: 'New Name' };
      mockRpc.mockResolvedValue({ data: updated, error: null });

      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
        profile: { id: 'user-1', username: 'testuser', display_name: 'Old Name' } as any,
      });

      await useAuthStore.getState().updateProfile({ display_name: 'New Name' });
      expect(mockRpc).toHaveBeenCalledWith(
        'update_own_profile',
        expect.objectContaining({ p_patch: { display_name: 'New Name' } }),
      );
      expect(useAuthStore.getState().profile).toMatchObject({
        id: 'user-1',
        display_name: 'New Name',
      });
    });

    it('throws when not authenticated', async () => {
      useAuthStore.setState({ session: null });
      await expect(
        useAuthStore.getState().updateProfile({ display_name: 'Test' }),
      ).rejects.toThrow('Not authenticated');
    });

    it('throws on supabase error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('RLS violation') });

      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
      });

      await expect(
        useAuthStore.getState().updateProfile({ display_name: 'Test' }),
      ).rejects.toThrow('RLS violation');
    });
  });
});
