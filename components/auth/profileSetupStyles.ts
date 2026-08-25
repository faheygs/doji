import { StyleSheet } from 'react-native';
import { Spacing } from '../../constants/theme';

export function createProfileSetupStyles(colors: { background: string; primary: string }) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    keyboardView: { flex: 1 },
    content: {
      flexGrow: 1,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xxl,
      gap: Spacing.lg,
      paddingBottom: Spacing.lg,
    },
    inputs: { gap: Spacing.md, marginTop: Spacing.md },
    avatarWrap: { alignSelf: 'center', alignItems: 'center', gap: Spacing.xs },
    avatarTouchable: { position: 'relative' },
    editFab: {
      position: 'absolute',
      right: -4,
      bottom: -4,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    footer: { marginTop: 'auto', paddingTop: Spacing.xl },
  });
}
