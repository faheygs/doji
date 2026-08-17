import React, { useCallback, useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { Text } from '../components/ui/Text';
import { IconShield } from '../components/icons/Icons';
import { Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { SUPPORT_EMAIL } from '../lib/legalDocuments';
import { useAuthStore } from '../stores/useAuthStore';

export default function BannedScreen() {
  const { colors } = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const profile = useAuthStore((state) => state.profile);

  const contactSupport = useCallback(() => {
    const subject = encodeURIComponent('Doji account ban appeal');
    const body = encodeURIComponent(
      `Username: @${profile?.username ?? 'unknown'}\n\nPlease tell us how we can help.`,
    );
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  }, [profile?.username]);

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xl,
    },
    icon: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      marginBottom: Spacing.lg,
    },
    title: { marginBottom: Spacing.sm },
    message: { lineHeight: 24, marginBottom: Spacing.xl },
    actions: { gap: Spacing.sm },
  }), [colors]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <IconShield size={34} color={colors.error} />
        </View>
        <Text variant="headingLarge" style={styles.title}>Your account has been banned</Text>
        <Text variant="body" color={colors.textSecondary} style={styles.message}>
          You can&apos;t use Doji with this account. If you believe this was a mistake,
          contact support and we&apos;ll review it.
        </Text>
        <View style={styles.actions}>
          <Button onPress={contactSupport} fullWidth>Contact support</Button>
          <Button variant="secondary" onPress={() => void signOut()} fullWidth>Sign out</Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
