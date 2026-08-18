import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useAppDialog } from '../contexts/DialogContext';
import { showProfilePhotoDialog } from '../lib/profilePhotoDialog';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.85,
  mediaTypes: ['images'],
};

export function useProfilePhotoPicker(onSelected: (uri: string) => void) {
  const { showDialog } = useAppDialog();

  const fromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Photo library permission denied' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const uri = !result.canceled ? result.assets[0]?.uri : null;
    if (uri) onSelected(uri);
  }, [onSelected]);

  const fromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Camera permission denied' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    const uri = !result.canceled ? result.assets[0]?.uri : null;
    if (uri) onSelected(uri);
  }, [onSelected]);

  return useCallback(() => {
    if (Platform.OS === 'web') return void fromLibrary();
    showProfilePhotoDialog(showDialog, () => void fromCamera(), () => void fromLibrary());
  }, [fromCamera, fromLibrary, showDialog]);
}
