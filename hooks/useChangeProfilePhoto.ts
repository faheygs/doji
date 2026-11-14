import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { removePublicStorageObject, uploadAvatar } from '../utils/upload';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import { invalidateQueryRoots } from '../lib/queryInvalidationBatcher';
import { useAppDialog } from '../contexts/DialogContext';
import { showProfilePhotoDialog } from '../lib/profilePhotoDialog';
import { PHOTO_SELECTION_ERROR, selectedImageUri } from '../lib/imagePickerRecovery';
import { reportOperationalFailure } from '../lib/telemetry';

const PICKER_QUALITY = 0.85 as const;
const afterPhotoSave = (operation: 'cleanup' | 'prefetch' | 'refresh', work: () => unknown) => {
  void Promise.resolve().then(work).catch(() => {
    reportOperationalFailure('profile-photo', operation, new Error('Profile photo follow-up failed'));
  });
};

export function useChangeProfilePhoto() {
  const { showDialog } = useAppDialog();
  const session = useAuthStore((s) => s.session);
  const currentAvatarUrl = useAuthStore((s) => s.profile?.avatar_url ?? null);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const uploadFromUri = useCallback(
    async (uri: string, account = captureProfileAccount()) => {
      const uid = session?.user?.id;
      if (!uid || account.userId !== uid || !account.isCurrent() || !mounted.current || busy.current) return;
      if (useAuthStore.getState().profileSaveState !== 'idle') {
        setError('Retry the previous profile save before uploading another photo.');
        return;
      }
      busy.current = true;
      setError('');
      setUploading(true);
      let uploadedUrl: string | null = null;
      try {
        const url = await uploadAvatar(uid, uri);
        uploadedUrl = url;
        if (!account.isCurrent() || !mounted.current) return;
        await updateProfile({ avatar_url: url });
        if (!account.isCurrent() || !mounted.current) return;
        uploadedUrl = null; // Never remove committed media after a refresh failure.
        if (currentAvatarUrl && currentAvatarUrl !== url) {
          afterPhotoSave('cleanup', () => removePublicStorageObject('avatars', currentAvatarUrl));
        }
        afterPhotoSave('prefetch', () => ExpoImage.prefetch(url));
        afterPhotoSave('refresh', () => invalidateQueryRoots(queryClient, ['feed', 'post', 'friends']));
        Toast.show({ type: 'success', text1: 'Profile photo updated!' });
      } catch (e: unknown) {
        if (!account.isCurrent() || !mounted.current) return;
        // A lost acknowledgement may follow commit; this is not an orphan receipt.
        const message = uploadedUrl
          ? `Doji could not confirm your profile photo was saved. ${useAuthStore.getState().profileSaveState === 'uncertain'
            ? 'Use Retry previous save without uploading again.' : 'Reopen your profile to check before trying again.'}`
          : e instanceof Error ? e.message : 'Could not upload photo';
        setError(message);
      } finally {
        busy.current = false;
        if (mounted.current) setUploading(false);
      }
    },
    [session?.user?.id, currentAvatarUrl, updateProfile, queryClient],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    const account = captureProfileAccount();
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        const uri = selectedImageUri(result);
        if (active && uri) void uploadFromUri(uri, account);
      })
      .catch(() => {
        if (active) setError('The cropped photo could not be opened. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [uploadFromUri]);

  const pickFromCamera = useCallback(async () => {
    const account = captureProfileAccount();
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!account.isCurrent() || !mounted.current) return;
    if (cam.status !== 'granted') {
      setError('Allow camera access to take a profile photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: PICKER_QUALITY,
      mediaTypes: ['images'],
    });
    const uri = selectedImageUri(result);
    if (uri) await uploadFromUri(uri, account);
  }, [uploadFromUri]);

  const pickFromLibrary = useCallback(async () => {
    const account = captureProfileAccount();
    if (Platform.OS !== 'android') {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!account.isCurrent() || !mounted.current) return;
      if (lib.status !== 'granted') {
        setError('Allow photo library access to choose a profile photo.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: PICKER_QUALITY,
      mediaTypes: ['images'],
    });
    const uri = selectedImageUri(result);
    if (uri) await uploadFromUri(uri, account);
  }, [uploadFromUri]);

  const openChangePhotoDialog = useCallback(() => {
    Haptics.selectionAsync();
    setError('');
    const failed = (source: 'camera' | 'library') => () => {
      reportOperationalFailure('profile-photo', 'select', new Error(PHOTO_SELECTION_ERROR), { source });
      setError(PHOTO_SELECTION_ERROR);
    };
    if (Platform.OS === 'web') {
      void pickFromLibrary().catch(failed('library'));
      return;
    }
    showProfilePhotoDialog(
      showDialog,
      () => void pickFromCamera().catch(failed('camera')),
      () => void pickFromLibrary().catch(failed('library')),
    );
  }, [pickFromCamera, pickFromLibrary, showDialog]);

  return { openChangePhotoDialog, uploading, error, clearError: () => setError('') };
}
