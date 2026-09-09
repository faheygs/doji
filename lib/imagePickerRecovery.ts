import type * as ImagePicker from 'expo-image-picker';

type PendingPickerResult =
  | ImagePicker.ImagePickerResult
  | ImagePicker.ImagePickerErrorResult
  | null;

/** Normalize both an immediate picker result and Android's recovered activity result. */
export function selectedImageUri(result: PendingPickerResult): string | null {
  if (!result) return null;
  if ('code' in result) {
    throw new Error(result.message || 'The selected photo could not be opened');
  }
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}
