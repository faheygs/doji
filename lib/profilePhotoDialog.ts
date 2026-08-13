import type { AppDialogOptions } from '../components/ui/AppDialog';

type ShowDialog = (options: AppDialogOptions) => void;

export function showProfilePhotoDialog(
  showDialog: ShowDialog,
  takePicture: () => void,
  selectPhoto: () => void,
) {
  showDialog({
    title: 'Profile photo',
    message: 'Take a picture or select a photo from your library.',
    layout: 'stacked',
    actions: [
      { label: 'Take a picture', onPress: takePicture },
      { label: 'Select a photo', variant: 'cancel', onPress: selectPhoto },
      { label: 'Cancel', variant: 'cancel' },
    ],
  });
}
