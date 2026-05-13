import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { uploadAvatar } from '../utils/upload';
import { useAuthStore } from '../stores/useAuthStore';

const PICKER_QUALITY = 0.85 as const;

export function useChangeProfilePhoto() {
  const session = useAuthStore((s) => s.session);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const uploadFromUri = useCallback(
    async (uri: string) => {
      const uid = session?.user?.id;
      if (!uid) return;
      setUploading(true);
      try {
        const url = await uploadAvatar(uid, uri);
        await updateProfile({ avatar_url: url });
        void ExpoImage.prefetch(url);
        await queryClient.invalidateQueries({ queryKey: ['feed'] });
        await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'profilePosts' });
        await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'post' });
        if (session?.user?.id) {
          await queryClient.invalidateQueries({ queryKey: ['friends', session.user.id] });
        }
        Toast.show({ type: 'success', text1: 'Profile photo updated!' });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Could not upload photo';
        Toast.show({ type: 'error', text1: message });
      } finally {
        setUploading(false);
      }
    },
    [session?.user?.id, updateProfile, queryClient],
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
    Alert.alert('Profile photo', 'Take a picture or select a photo from your library.', [
      { text: 'Take a picture', onPress: () => void pickFromCamera() },
      { text: 'Select a photo', onPress: () => void pickFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFromCamera, pickFromLibrary]);

  return { openChangePhotoDialog, uploading };
}
