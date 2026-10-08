import React, { useCallback, useRef, useState } from 'react';
import { Linking, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { AppKeyboardAwareScrollView } from '@/components/ui/AppKeyboardAwareScrollView';
import { Button } from '@/components/ui/Button';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Text } from '@/components/ui/Text';
import { IconChevronLeft } from '@/components/icons/Icons';
import { Radius, Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';
import { TAB_SCREEN_SAFE_AREA_EDGES } from '@/lib/safeAreaLayout';
import { SUPPORT_EMAIL } from '@/lib/legalDocuments';
import { supportDiagnosticDetails, supportEmailUrl } from '@/lib/supportDiagnostics';
import { useAuthStore } from '@/stores/useAuthStore';

export default function ReportProblemScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const actor = useAuthStore(state => state.session?.user?.id);
  const [snapshot, setSnapshot] = useState(() => ({ actor, text: supportDiagnosticDetails() }));
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const inFlight = useRef(false);
  const details = snapshot.actor === actor ? snapshot.text : '';
  useFocusEffect(useCallback(() => {
    active.current = true;
    setSnapshot({ actor, text: supportDiagnosticDetails() });
    setFeedback(''); setBusy(false);
    return () => { active.current = false; };
  }, [actor]));
  const open = async (kind: 'email' | 'share') => {
    if (inFlight.current || !details || useAuthStore.getState().session?.user?.id !== actor) return;
    inFlight.current = true; setBusy(true); setFeedback('');
    try {
      if (kind === 'email') await Linking.openURL(supportEmailUrl(details));
      else await Share.share({ message: details, title: 'Doji diagnostic details' });
      // Opening a composer/share sheet is NOT a submitted report.
    } catch {
      if (active.current && useAuthStore.getState().session?.user?.id === actor) {
        setFeedback(kind === 'email'
          ? `Could not open an email app. Copy the details below and contact ${SUPPORT_EMAIL}.`
          : 'Could not open sharing. Press and hold the details below to copy them.');
      }
    } finally {
      inFlight.current = false;
      if (active.current && useAuthStore.getState().session?.user?.id === actor) setBusy(false);
    }
  };
  return (
    <SafeAreaView edges={TAB_SCREEN_SAFE_AREA_EDGES} style={[styles.safe, webScrollParentStyle, { backgroundColor: colors.background }]}>
      <AppKeyboardAwareScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" style={styles.back}
            onPress={() => goBackWithOptionalReturn(router, returnTo, '/(app)/profile/settings' as Href)}>
            <IconChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text variant="headingLarge" style={styles.title}>Report a problem</Text>
        </View>
        <Text>Tell us what happened, roughly when, and what you expected. Please don’t include passwords or private messages.</Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text variant="headingMedium">Diagnostic details</Text>
          <Text color={colors.textSecondary}>These random references help support find related diagnostics. They are not your account ID. Only share them with people you trust.</Text>
          <Text selectable variant="bodySmall" accessibilityLabel="Diagnostic details">{details || 'Preparing details…'}</Text>
          <Text variant="micro" color={colors.textSecondary}>Press and hold to select and copy. These details describe this installation and session, not necessarily an earlier problem.</Text>
        </View>
        {feedback ? <InlineFeedback message={feedback} /> : null}
        <Text selectable color={colors.textSecondary}>{SUPPORT_EMAIL}</Text>
        <Text variant="bodySmall" color={colors.textSecondary}>Email support opens a draft with the details shown above. Nothing is sent until you choose Send in your email app.</Text>
        <Button onPress={() => void open('email')} disabled={busy || !details} fullWidth>Email support</Button>
        <Button onPress={() => void open('share')} disabled={busy || !details} variant="secondary" fullWidth>Share diagnostic details</Button>
      </AppKeyboardAwareScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  back: { minWidth: 48, minHeight: 48, justifyContent: 'center' }, title: { flex: 1 },
  card: { padding: Spacing.md, gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg },
});
