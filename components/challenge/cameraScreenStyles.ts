import { StyleSheet } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';

export const cameraScreenStyles = StyleSheet.create({
  container: { flex: 1 },
  chooseRoot: { flex: 1 },
  chooseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  headerButtonDark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseBody: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing.md,
    alignItems: 'center',
  },
  chooseTitle: { textAlign: 'center' },
  chooseSub: { textAlign: 'center', lineHeight: 22 },
  chooseButtons: { width: '100%', marginTop: Spacing.lg, gap: Spacing.sm },
  previewContent: { flexGrow: 1 },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  previewHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dualPhotoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 3 / 4,
  },
  mainPreview: { width: '100%', height: '100%' },
  frontPreviewContainer: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 3,
  },
  frontPreview: { width: 90, height: 90 },
  videoPreviewWrap: { width: '100%', marginTop: Spacing.sm },
  videoPreview: { width: '100%', aspectRatio: 16 / 9 },
  previewFooter: { padding: Spacing.lg, gap: Spacing.md },
  captionInput: { flex: 1 },
});
