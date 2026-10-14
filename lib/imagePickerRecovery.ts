import type * as ImagePicker from 'expo-image-picker';

type PendingPickerResult =
  | ImagePicker.ImagePickerResult
  | ImagePicker.ImagePickerErrorResult
  | null;

export const PHOTO_SELECTION_ERROR = 'This photo could not be opened. Please try again or choose another photo.';

/** Normalize both an immediate picker result and Android's recovered activity result. */
export function selectedImageUri(result: PendingPickerResult): string | null {
  if (!result) return null;
  if ('code' in result) {
    throw new Error(result.message || 'The selected photo could not be opened');
  }
  if (result.canceled) return null;
  const uri = result.assets?.[0]?.uri;
  if (typeof uri !== 'string' || !uri.trim()) throw new Error(PHOTO_SELECTION_ERROR);
  return uri;
}
