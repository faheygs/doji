import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppKeyboardAwareScrollView } from '../components/ui/AppKeyboardAwareScrollView';
import { Button } from '../components/ui/Button';
import { InlineFeedback } from '../components/ui/InlineFeedback';
import { Input } from '../components/ui/Input';
import { Text } from '../components/ui/Text';
import { IconShield } from '../components/icons/Icons';
import { Radius, Spacing, webScrollParentStyle } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useModerationStatus, useSubmitModerationAppeal } from '../hooks/useModerationStatus';
import { SUPPORT_EMAIL } from '../lib/legalDocuments';
import { useAuthStore } from '../stores/useAuthStore';
import { DeleteAccountAction } from '../components/settings/DeleteAccountAction';

export default function BannedScreen() {
  const { colors } = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const profile = useAuthStore((state) => state.profile);
  const status = useModerationStatus();
  const submitAppeal = useSubmitModerationAppeal();
  const [appealOpen, setAppealOpen] = useState(false);
  const [statement, setStatement] = useState('');

  const access = status.data?.account_access;
  const decision = status.data?.decisions.find((item) => item.id === access?.decision_id);
  const canAppeal = Boolean(
    decision?.state === 'active' && decision.appeal_eligible && !decision.appeal,
  );

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
      flexGrow: 1,
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
    message: { lineHeight: 24 },
    actions: { gap: Spacing.sm },
    decisionCard: {
      marginVertical: Spacing.lg,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      gap: Spacing.sm,
    },
    appealForm: { gap: Spacing.sm },
    loading: { paddingVertical: Spacing.lg, alignItems: 'center' },
  }), [colors]);

  const submit = useCallback(async () => {
    if (!decision) return;
    try {
      await submitAppeal.mutateAsync({ decisionId: decision.id, statement: statement.trim() });
      setAppealOpen(false);
      setStatement('');
    } catch {
      // The mutation error remains beside the form.
    }
  }, [decision, statement, submitAppeal]);

  return (
    <SafeAreaView style={styles.safe}>
      <AppKeyboardAwareScrollView
        style={webScrollParentStyle}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.icon}>
          <IconShield size={34} color={colors.error} />
        </View>
        <Text variant="headingLarge" style={styles.title}>Your account is suspended</Text>
        <Text variant="body" color={colors.textSecondary} style={styles.message}>
          You can&apos;t use Doji with this account right now. Review the decision below or
          submit an appeal if you believe it was a mistake.
        </Text>

        {status.isLoading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : status.isError ? (
          <View style={styles.decisionCard}>
            <InlineFeedback
              title="Decision details unavailable"
              message="Check your connection and try again. Your appeal option remains available once the details load."
            />
            <Button variant="secondary" onPress={() => void status.refetch()} fullWidth>Try again</Button>
          </View>
        ) : (
          <View style={styles.decisionCard}>
            <Text variant="headingMedium">{access?.title || 'Account access decision'}</Text>
            <Text variant="body" color={colors.textSecondary}>
              {access?.body || decision?.user_notice || 'Contact support for details about this account decision.'}
            </Text>
            {decision?.appeal ? (
              <InlineFeedback
                tone={decision.appeal.status === 'reversed' ? 'success' : 'info'}
                title={decision.appeal.status === 'pending' ? 'Appeal submitted' : 'Appeal reviewed'}
                message={decision.appeal.review_reason || 'A different authorized reviewer will evaluate your appeal.'}
              />
            ) : canAppeal && !appealOpen ? (
              <Button variant="secondary" onPress={() => setAppealOpen(true)} fullWidth>
                Appeal decision
              </Button>
            ) : null}
            {appealOpen && decision ? (
              <View style={styles.appealForm}>
                <Input
                  label="Why should this decision be reviewed?"
                  value={statement}
                  onChangeText={setStatement}
                  multiline
                  maxLength={2000}
                  placeholder="Add context the reviewer should consider."
                  style={{ minHeight: 120, textAlignVertical: 'top' }}
                  hint="20–2,000 characters. A different authorized reviewer decides the appeal."
                  error={submitAppeal.error instanceof Error ? submitAppeal.error.message : undefined}
                />
                <Button
                  disabled={statement.trim().length < 20}
                  loading={submitAppeal.isPending}
                  onPress={() => void submit()}
                  fullWidth
                >
                  Submit appeal
                </Button>
                <Button variant="secondary" onPress={() => setAppealOpen(false)} fullWidth>Cancel</Button>
              </View>
            ) : null}
          </View>
        )}
        <View style={styles.actions}>
          <Button onPress={contactSupport} fullWidth>Contact support</Button>
          <Button variant="secondary" onPress={() => void signOut()} fullWidth>Sign out</Button>
          <DeleteAccountAction />
        </View>
      </AppKeyboardAwareScrollView>
    </SafeAreaView>
  );
}
