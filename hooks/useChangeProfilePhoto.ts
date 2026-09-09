import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { removePublicStorageObject, uploadAvatar } from '../utils/upload';
import { useAuthStore } from '../stores/useAuthStore';
import { invalidateQueryRoots } from '../lib/queryInvalidationBatcher';
import { useAppDialog } from '../contexts/DialogContext';
import { showProfilePhotoDialog } from '../lib/profilePhotoDialog';
import { selectedImageUri } from '../lib/imagePickerRecovery';

const PICKER_QUALITY = 0.85 as const;

export function useChangeProfilePhoto() {
  const { showDialog } = useAppDialog();
  const session = useAuthStore((s) => s.session);
  const currentAvatarUrl = useAuthStore((s) => s.profile?.avatar_url ?? null);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadFromUri = useCallback(
    async (uri: string) => {
      const uid = session?.user?.id;
      if (!uid) return;
      setError('');
      setUploading(true);
      let uploadedUrl: string | null = null;
      try {
        const url = await uploadAvatar(uid, uri);
        uploadedUrl = url;
        await updateProfile({ avatar_url: url });
        if (currentAvatarUrl && currentAvatarUrl !== url) {
          void removePublicStorageObject('avatars', currentAvatarUrl);
        }
        void ExpoImage.prefetch(url);
        await invalidateQueryRoots(queryClient, ['feed', 'post', 'friends']);
        Toast.show({ type: 'success', text1: 'Profile photo updated!' });
      } catch (e: unknown) {
        if (uploadedUrl) void removePublicStorageObject('avatars', uploadedUrl);
        const message = e instanceof Error ? e.message : 'Could not upload photo';
        setError(message);
      } finally {
        setUploading(false);
      }
    },
    [session?.user?.id, currentAvatarUrl, updateProfile, queryClient],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        const uri = selectedImageUri(result);
        if (active && uri) void uploadFromUri(uri);
      })
      .catch(() => {
        if (active) setError('The cropped photo could not be opened. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [uploadFromUri]);

  const pickFromCamera = useCallback(async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
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
    if (uri) await uploadFromUri(uri);
  }, [uploadFromUri]);

  const pickFromLibrary = useCallback(async () => {
    if (Platform.OS !== 'android') {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
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
    if (uri) await uploadFromUri(uri);
  }, [uploadFromUri]);

  const openChangePhotoDialog = useCallback(() => {
    Haptics.selectionAsync();
    setError('');
    if (Platform.OS === 'web') {
      void pickFromLibrary();
      return;
    }
    showProfilePhotoDialog(
      showDialog,
      () => void pickFromCamera(),
      () => void pickFromLibrary(),
    );
  }, [pickFromCamera, pickFromLibrary, showDialog]);

  return { openChangePhotoDialog, uploading, error, clearError: () => setError('') };
}
