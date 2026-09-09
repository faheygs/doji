import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppDialog } from '../contexts/DialogContext';
import { showProfilePhotoDialog } from '../lib/profilePhotoDialog';
import { selectedImageUri } from '../lib/imagePickerRecovery';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.85,
  mediaTypes: ['images'],
};

export function useProfilePhotoPicker(
  onSelected: (uri: string) => void,
  onError?: (message: string) => void,
) {
  const { showDialog } = useAppDialog();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        const uri = selectedImageUri(result);
        if (active && uri) onSelected(uri);
      })
      .catch(() => {
        if (active) onError?.('The cropped photo could not be opened. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [onError, onSelected]);

  const fromLibrary = useCallback(async () => {
    if (Platform.OS !== 'android') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        onError?.('Allow photo library access to choose a profile photo.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const uri = selectedImageUri(result);
    if (uri) onSelected(uri);
  }, [onError, onSelected]);

  const fromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      onError?.('Allow camera access to take a profile photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    const uri = selectedImageUri(result);
    if (uri) onSelected(uri);
  }, [onError, onSelected]);

  return useCallback(() => {
    if (Platform.OS === 'web') return void fromLibrary();
    showProfilePhotoDialog(
      showDialog,
      () => void fromCamera(),
      () => void fromLibrary(),
    );
  }, [fromCamera, fromLibrary, showDialog]);
}
