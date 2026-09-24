import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppKeyboardAwareScrollView } from '@/components/ui/AppKeyboardAwareScrollView';
import { Button } from '@/components/ui/Button';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { IconChevronLeft, IconShield } from '@/components/icons/Icons';
import { Radius, Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useModerationStatus, useSubmitModerationAppeal } from '@/hooks/useModerationStatus';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';
import { TAB_SCREEN_SAFE_AREA_EDGES } from '@/lib/safeAreaLayout';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function decisionDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AccountStatusScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const status = useModerationStatus();
  const submitAppeal = useSubmitModerationAppeal();
  const [appealingDecisionId, setAppealingDecisionId] = useState<string | null>(null);
  const [statement, setStatement] = useState('');

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: Spacing.xxl },
    header: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    intro: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.xs },
    healthy: {
      marginHorizontal: Spacing.md,
      padding: Spacing.lg,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      gap: Spacing.sm,
    },
    currentIssue: {
      marginHorizontal: Spacing.md,
      padding: Spacing.lg,
      borderRadius: Radius.lg,
      backgroundColor: `${colors.warning}12`,
      borderWidth: 1,
      borderColor: `${colors.warning}40`,
      gap: Spacing.xs,
    },
    historyHeader: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.sm,
      gap: Spacing.xs,
    },
    card: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      gap: Spacing.sm,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: colors.fillMuted,
    },
    appealBox: { marginTop: Spacing.xs, gap: Spacing.sm },
    actions: { flexDirection: 'row', gap: Spacing.sm },
    loading: { padding: Spacing.xl },
    error: { marginHorizontal: Spacing.md, gap: Spacing.sm },
  }), [colors]);

  const decisions = status.data?.decisions ?? [];
  const active = decisions.filter((decision) => decision.state === 'active' && decision.action !== 'no_violation');

  const submit = async (decisionId: string) => {
    try {
      await submitAppeal.mutateAsync({ decisionId, statement: statement.trim() });
      setAppealingDecisionId(null);
      setStatement('');
    } catch {
      // The mutation error remains beside the appeal form below.
    }
  };

  return (
    <SafeAreaView edges={TAB_SCREEN_SAFE_AREA_EDGES} style={[styles.safe, webScrollParentStyle]}>
      <AppKeyboardAwareScrollView
        style={webScrollParentStyle}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              void Haptics.selectionAsync();
              goBackWithOptionalReturn(router, returnTo, '/(app)/profile/settings' as Href);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <IconChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text variant="headingLarge" style={{ flex: 1 }}>Account status</Text>
        </View>

        <View style={styles.intro}>
          <Text variant="body" color={colors.textSecondary}>
            See Doji policy decisions, warnings, and appeals tied to your account.
          </Text>
        </View>

        {status.isLoading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : status.isError ? (
          <View style={styles.error}>
            <InlineFeedback
              title="Account status unavailable"
              message="We couldn't load your status. Check your connection and try again."
            />
            <Button variant="secondary" fullWidth onPress={() => void status.refetch()}>
              Try again
            </Button>
          </View>
        ) : (
          <>
            {active.length === 0 ? (
              <View style={styles.healthy}>
                <IconShield size={34} color={colors.success} />
                <Text variant="headingMedium">No active policy issues</Text>
                <Text variant="bodySmall" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                  Your account currently has no active content removals or warnings.
                </Text>
              </View>
            ) : (
              <View style={styles.currentIssue}>
                <Text variant="headingMedium">{active.length} active policy {active.length === 1 ? 'issue' : 'issues'}</Text>
                <Text variant="bodySmall" color={colors.textSecondary}>
                  Review the decision history below for details and available appeal options.
                </Text>
              </View>
            )}

            {decisions.length > 0 ? (
              <View style={styles.historyHeader}>
                <Text variant="headingMedium">Decision history</Text>
                <Text variant="bodySmall" color={colors.textSecondary}>
                  Decisions, warnings, and appeal outcomes associated with your account.
                </Text>
              </View>
            ) : null}

            {decisions.map((decision) => {
          const canAppeal = decision.state === 'active' && decision.appeal_eligible && !decision.appeal;
          const appealOpen = appealingDecisionId === decision.id;
          const resolved = decision.state === 'reversed' || decision.action === 'no_violation';
          const badgeColor = resolved ? colors.success : decision.state === 'active' ? colors.warning : colors.textSecondary;
          return (
            <View key={decision.id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="headingMedium">{label(decision.action)}</Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    {label(decision.content_kind)} · {label(decision.policy_code)} · {label(decision.severity)}
                  </Text>
                  {decisionDate(decision.decided_at) ? (
                    <Text variant="micro" color={colors.textTertiary}>{decisionDate(decision.decided_at)}</Text>
                  ) : null}
                </View>
                <View style={[styles.badge, { backgroundColor: `${badgeColor}14` }]}>
                  <Text variant="micro" color={badgeColor}>{label(decision.state)}</Text>
                </View>
              </View>
              <Text variant="body" color={colors.textSecondary}>{decision.user_notice}</Text>
              {decision.appeal ? (
                <InlineFeedback
                  tone={decision.appeal.status === 'reversed' ? 'success' : 'info'}
                  title={`Appeal ${label(decision.appeal.status)}`}
                  message={decision.appeal.review_reason || 'Your appeal is awaiting an independent review.'}
                />
              ) : canAppeal && !appealOpen ? (
                <Button variant="secondary" onPress={() => setAppealingDecisionId(decision.id)} fullWidth>
                  Appeal decision
                </Button>
              ) : null}
              {appealOpen ? (
                <View style={styles.appealBox}>
                  <Input
                    label="Why should this decision be reviewed?"
                    value={statement}
                    onChangeText={setStatement}
                    multiline
                    maxLength={2000}
                    placeholder="Add context the reviewer should consider."
                    style={{ minHeight: 120, textAlignVertical: 'top' }}
                    error={submitAppeal.error instanceof Error ? submitAppeal.error.message : undefined}
                    hint="20–2,000 characters. A different authorized reviewer decides the appeal."
                  />
                  <View style={styles.actions}>
                    <Button
                      variant="secondary"
                      style={{ flex: 1 }}
                      onPress={() => { setAppealingDecisionId(null); setStatement(''); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      style={{ flex: 1 }}
                      disabled={statement.trim().length < 20}
                      loading={submitAppeal.isPending}
                      onPress={() => void submit(decision.id)}
                    >
                      Submit appeal
                    </Button>
                  </View>
                </View>
              ) : null}
            </View>
          );
            })}
          </>
        )}
      </AppKeyboardAwareScrollView>
    </SafeAreaView>
  );
}
