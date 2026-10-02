import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { KeyboardSafeSheet } from '../ui/KeyboardSafeSheet';
import { AppTextInput } from '../ui/AppTextInput';
import { IconCheck, IconChevronRight, IconShield } from '../icons/Icons';
import { useReportContent } from '../../hooks/useReportContent';
import { useBlockUser, useIsBlockedByMe } from '../../hooks/useBlockUser';
import {
  reportDetailsFor,
  reportReasonsFor,
  reportTargetLabel,
  type ReportReason,
  type ReportReasonDetail,
  type ReportTargetKind,
} from '../../lib/reportingTaxonomy';
import { InlineFeedback } from '../ui/InlineFeedback';

type Step = 'target' | 'reason' | 'detail' | 'notes' | 'success';

export type ReportSubject = {
  reportedUserId: string;
  /** Report a post, including its image and caption. */
  postId?: string;
  /** Report a comment. */
  commentId?: string;
  /** Report an "Other" poll response. */
  pollVoteId?: string;
  /** Account/profile reports choose between these targets inside the flow when omitted. */
  targetKind?: 'profile_photo' | 'account';
};
type Props = ReportSubject & { visible: boolean; onClose: () => void };

export function ReportSheet(props: Props) {
  const { visible, reportedUserId, postId, commentId, pollVoteId, targetKind, onClose } = props;
  const fixedTarget: ReportTargetKind | null = postId
    ? 'post'
    : commentId
      ? 'comment'
      : pollVoteId
        ? 'poll_response'
        : (targetKind ?? null);
  const { colors } = useTheme();
  const router = useRouter();
  const report = useReportContent();
  const blockUser = useBlockUser();
  const resetReport = report.reset;
  const resetBlock = blockUser.reset;
  const blockedQuery = useIsBlockedByMe(reportedUserId);
  const [step, setStep] = useState<Step>(() => (fixedTarget ? 'reason' : 'target'));
  const [target, setTarget] = useState<ReportTargetKind | null>(() => fixedTarget);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState<ReportReasonDetail | null>(null);
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState('');
  const submitInFlight = useRef(false);
  const afterDismiss = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep(fixedTarget ? 'reason' : 'target');
    setTarget(fixedTarget);
    setReason(null);
    setDetail(null);
    setNotes('');
    setSubmitError('');
    resetReport();
    resetBlock();
  }, [visible, fixedTarget, reportedUserId, postId, commentId, pollVoteId, resetReport, resetBlock]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        intro: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
        introTitle: { textAlign: 'center' },
        introCopy: { textAlign: 'center', lineHeight: 20, maxWidth: 420 },
        list: { gap: 0 },
        row: {
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
          paddingVertical: Spacing.md,
        },
        rowCopy: { flex: 1, gap: 3 },
        targetCard: {
          minHeight: 78,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          marginBottom: Spacing.sm,
          padding: Spacing.md,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
        },
        targetIcon: {
          width: 42,
          height: 42,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 21,
          backgroundColor: `${colors.primary}18`,
        },
        notesInput: {
          minHeight: 130,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
          padding: Spacing.md,
          color: colors.text,
          backgroundColor: colors.surfaceMuted,
          textAlignVertical: 'top',
          fontSize: 16,
        },
        success: { alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.xl },
        checkCircle: {
          width: 88,
          height: 88,
          borderRadius: 44,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${colors.success}18`,
        },
        successCopy: { textAlign: 'center', lineHeight: 21, maxWidth: 390 },
        actionList: { width: '100%', marginTop: Spacing.lg },
      }),
    [colors],
  );

  const resetAndClose = useCallback(() => {
    if (submitInFlight.current) return;
    setSubmitError('');
    onClose();
  }, [onClose]);

  const goBack = useCallback(() => {
    if (submitInFlight.current) return;
    setSubmitError('');
    if (step === 'reason') {
      if (!fixedTarget) {
        setTarget(null);
        setStep('target');
      }
      return;
    }
    if (step === 'detail') {
      setReason(null);
      setDetail(null);
      setStep('reason');
      return;
    }
    if (step === 'notes') {
      setDetail(null);
      setStep('detail');
    }
  }, [fixedTarget, step]);

  const submit = useCallback(
    (selectedDetail: ReportReasonDetail, selectedNotes?: string) => {
      if (!target || !reason || submitInFlight.current) return;
      submitInFlight.current = true;
      setSubmitError('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      report.mutate(
        {
          reportedUserId,
          postId,
          commentId,
          pollVoteId,
          targetKind: target,
          reason,
          reasonDetail: selectedDetail,
          notes: selectedNotes,
        },
        {
          onSuccess: () => {
            setDetail(selectedDetail);
            setStep('success');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
          onError: () => setSubmitError('Could not submit this report. Please try again.'),
          onSettled: () => { submitInFlight.current = false; },
        },
      );
    },
    [commentId, pollVoteId, postId, reason, report, reportedUserId, target],
  );

  const chooseDetail = useCallback(
    (selectedDetail: ReportReasonDetail) => {
      setDetail(selectedDetail);
      if (selectedDetail === 'other') {
        setStep('notes');
        return;
      }
      submit(selectedDetail);
    },
    [submit],
  );

  const canGoBack = step !== 'target' && step !== 'success' && (step !== 'reason' || !fixedTarget);

  return (
    <KeyboardSafeSheet
      visible={visible}
      onClose={resetAndClose}
      nativeDismissal
      onDismiss={() => {
        const action = afterDismiss.current;
        afterDismiss.current = null;
        action?.();
      }}
      onBack={canGoBack && !report.isPending ? goBack : undefined}
      centeredHeader
      title={step === 'success' ? 'Report sent' : 'Report'}
      heightFraction={0.88}
      footer={
        report.isPending || submitError || step === 'notes' || step === 'success' ? (
          <View style={{ gap: Spacing.sm }}>
            {report.isPending ? <InlineFeedback tone="info" message="Sending your report…" /> : null}
            {submitError && step !== 'success' ? <InlineFeedback message={submitError} /> : null}
            {step === 'notes' ? (
              <Button
                variant="danger"
                fullWidth
                loading={report.isPending}
                disabled={notes.trim().length < 3 || report.isPending}
                onPress={() => detail && submit(detail, notes)}
              >
                Submit report
              </Button>
            ) : step === 'success' ? (
              <Button fullWidth onPress={resetAndClose}>
                Done
              </Button>
            ) : null}
          </View>
        ) : undefined
      }
    >
      {step === 'target' ? (
        <>
          <View style={styles.intro}>
            <Text variant="headingLarge" style={styles.introTitle}>
              What do you want to report?
            </Text>
            <Text variant="bodySmall" color={colors.textSecondary} style={styles.introCopy}>
              Choose the specific thing you want our team to review.
            </Text>
          </View>
          <Pressable
            style={styles.targetCard}
            onPress={() => {
              setTarget('profile_photo');
              setStep('reason');
            }}
          >
            <View style={styles.targetIcon}>
              <IconShield size={22} color={colors.primary} />
            </View>
            <View style={styles.rowCopy}>
              <Text variant="subhead">Profile photo</Text>
              <Text variant="micro" color={colors.textSecondary}>
                Report the current avatar only
              </Text>
            </View>
            <IconChevronRight size={21} color={colors.textTertiary} />
          </Pressable>
          <Pressable
            style={styles.targetCard}
            onPress={() => {
              setTarget('account');
              setStep('reason');
            }}
          >
            <View style={styles.targetIcon}>
              <IconShield size={22} color={colors.primary} />
            </View>
            <View style={styles.rowCopy}>
              <Text variant="subhead">Account or behavior</Text>
              <Text variant="micro" color={colors.textSecondary}>
                Impersonation, harassment, scams, or repeated behavior
              </Text>
            </View>
            <IconChevronRight size={21} color={colors.textTertiary} />
          </Pressable>
        </>
      ) : null}

      {step === 'reason' && target ? (
        <>
          <View style={styles.intro}>
            <Text variant="headingLarge" style={styles.introTitle}>
              Why are you reporting this {reportTargetLabel(target)}?
            </Text>
            <Text variant="bodySmall" color={colors.textSecondary} style={styles.introCopy}>
              Your report is confidential. The person will not be told who reported it. If someone
              is in immediate danger, contact local emergency services.
            </Text>
          </View>
          <View style={styles.list}>
            {reportReasonsFor(target).map((option) => (
              <Pressable
                key={option.value}
                style={styles.row}
                onPress={() => {
                  setReason(option.value);
                  setStep('detail');
                }}
              >
                <View style={styles.rowCopy}>
                  <Text variant="body">{option.label}</Text>
                </View>
                <IconChevronRight size={21} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {step === 'detail' && target && reason ? (
        <>
          <View style={styles.intro}>
            <Text variant="headingLarge" style={styles.introTitle}>
              What best describes the problem?
            </Text>
            <Text variant="bodySmall" color={colors.textSecondary} style={styles.introCopy}>
              This helps route the report to the right review queue.
            </Text>
          </View>
          <View style={styles.list}>
            {reportDetailsFor(reason, target).map((option) => (
              <Pressable
                key={option.value}
                style={styles.row}
                disabled={report.isPending}
                onPress={() => chooseDetail(option.value)}
              >
                <View style={styles.rowCopy}>
                  <Text variant="body">{option.label}</Text>
                </View>
                <IconChevronRight size={21} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {step === 'notes' ? (
        <>
          <View style={styles.intro}>
            <Text variant="headingLarge" style={styles.introTitle}>
              Tell us what happened
            </Text>
            <Text variant="bodySmall" color={colors.textSecondary} style={styles.introCopy}>
              Do not include passwords, payment information, or evidence you do not already possess.
            </Text>
          </View>
          <AppTextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a short explanation"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            autoFocus
          />
          <Text variant="micro" color={colors.textTertiary} style={{ textAlign: 'right' }}>
            {notes.length}/500
          </Text>
        </>
      ) : null}

      {step === 'success' ? (
        <View style={styles.success}>
          <View style={styles.checkCircle}>
            <IconCheck size={42} color={colors.success} />
          </View>
          <Text variant="headingLarge" style={styles.introTitle}>
            Thanks for letting us know
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.successCopy}>
            We’ll review this report. The account will not be told who submitted it.
          </Text>
          <View style={styles.actionList}>
            {blockUser.isError ? <InlineFeedback message="Could not block this account. Please try again." /> : null}
            {!blockedQuery.data ? (
              <Pressable
                style={styles.row}
                disabled={blockUser.isPending}
                onPress={() =>
                  blockUser.mutate(
                    { blockedUserId: reportedUserId },
                    { onSuccess: () => Toast.show({ type: 'success', text1: 'Account blocked' }) },
                  )
                }
              >
                <View style={styles.rowCopy}>
                  <Text variant="subhead">Block this account</Text>
                  <Text variant="micro" color={colors.textSecondary}>
                    Remove their content from your Doji experience
                  </Text>
                </View>
                <IconChevronRight size={21} color={colors.textTertiary} />
              </Pressable>
            ) : null}
            <Pressable
              style={styles.row}
              onPress={() => {
                afterDismiss.current = () => router.push('/(app)/legal/terms');
                resetAndClose();
              }}
            >
              <View style={styles.rowCopy}>
                <Text variant="subhead">Review Doji’s Community Standards</Text>
              </View>
              <IconChevronRight size={21} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </KeyboardSafeSheet>
  );
}
