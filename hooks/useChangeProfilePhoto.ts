import { useCallback, useState } from 'react';
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

const PICKER_QUALITY = 0.85 as const;

export function useChangeProfilePhoto() {
  const { showDialog } = useAppDialog();
  const session = useAuthStore((s) => s.session);
  const currentAvatarUrl = useAuthStore((s) => s.profile?.avatar_url ?? null);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const uploadFromUri = useCallback(
    async (uri: string) => {
      const uid = session?.user?.id;
      if (!uid) return;
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
        Toast.show({ type: 'error', text1: message });
      } finally {
        setUploading(false);
      }
    },
    [session?.user?.id, currentAvatarUrl, updateProfile, queryClient],
  );

  const pickFromCamera = useCallback(async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Camera permission denied' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: PICKER_QUALITY,
      mediaTypes: ['images'],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await uploadFromUri(result.assets[0].uri);
    }
  }, [uploadFromUri]);

  const pickFromLibrary = useCallback(async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (lib.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Photo library permission denied' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: PICKER_QUALITY,
      mediaTypes: ['images'],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await uploadFromUri(result.assets[0].uri);
    }
  }, [uploadFromUri]);

  const openChangePhotoDialog = useCallback(() => {
    Haptics.selectionAsync();
    if (Platform.OS === 'web') {
      void pickFromLibrary();
      return;
    }
    showProfilePhotoDialog(showDialog, () => void pickFromCamera(), () => void pickFromLibrary());
  }, [pickFromCamera, pickFromLibrary, showDialog]);

  return { openChangePhotoDialog, uploading };
}
