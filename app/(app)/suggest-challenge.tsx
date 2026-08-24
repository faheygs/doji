import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, Shadows, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { AppKeyboardAwareScrollView } from '@/components/ui/AppKeyboardAwareScrollView';
import { IconPlus, IconClose, IconCamera, IconComment, IconUsers } from '@/components/icons/Icons';
import { IcnBarChart } from '@/components/icons/BadgeIcons';
import { executeCommand } from '@/lib/commandGateway';
import { useAuthStore } from '@/stores/useAuthStore';
import { hashSuggestionBody } from '@/lib/hashString';
import { newCommandId } from '@/lib/idempotency';
import { filterContent } from '@/lib/contentFilter';
import { minLength, validationMessage } from '@/lib/formValidation';
import type { AnswerRule } from '@/types/database';
import { InlineFeedback, type InlineFeedbackData } from '@/components/ui/InlineFeedback';

const BODY_MIN = 8;

const KINDS = [
  {
    key: 'poll' as const,
    label: 'Poll',
    shortLabel: 'Poll',
    hint: 'Two or more choices; everyone votes for one.',
    Icon: IcnBarChart,
  },
  {
    key: 'wyr' as const,
    label: 'Would you rather',
    shortLabel: 'WYR',
    hint: 'Two or more contrasting options to choose between.',
    Icon: IconUsers,
  },
  {
    key: 'question' as const,
    label: 'Question',
    shortLabel: 'Question',
    hint: 'Open prompt — others answer in free text.',
    Icon: IconComment,
  },
  {
    key: 'format_question' as const,
    label: 'Format question',
    shortLabel: 'Format',
    hint: 'Define how answers must be formatted (word count or starting letter).',
    Icon: IconComment,
  },
  {
    key: 'photo_idea' as const,
    label: 'Photo idea',
    shortLabel: 'Photo',
    hint: 'Something people snap a picture for.',
    Icon: IconCamera,
  },
];

type KindKey = (typeof KINDS)[number]['key'];
type FormatRuleKind = 'starts_with_letter' | 'exact_word_count';
function emptyOptionRows(n: number): string[] {
  return Array.from({ length: n }, () => '');
}

export default function SuggestChallengeScreen() {
  const { colors } = useTheme();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [kind, setKind] = useState<KindKey>('poll');
  const [body, setBody] = useState('');
  const [optionRows, setOptionRows] = useState<string[]>(() => emptyOptionRows(2));
  const [formatRuleKind, setFormatRuleKind] = useState<FormatRuleKind>('exact_word_count');
  const [formatLetter, setFormatLetter] = useState('S');
  const [formatWordCount, setFormatWordCount] = useState('2');
  const [saving, setSaving] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<InlineFeedbackData | null>(null);
  const needsOptions = kind === 'poll' || kind === 'wyr';
  const needsFormatRule = kind === 'format_question';
  const selectedKind = KINDS.find((k) => k.key === kind) ?? KINDS[0];
  const resetOptionsForKind = useCallback((k: KindKey) => {
    if (k === 'poll' || k === 'wyr') {
      setOptionRows(emptyOptionRows(2));
    } else {
      setOptionRows([]);
    }
    if (k === 'format_question') {
      setFormatRuleKind('exact_word_count');
      setFormatLetter('S');
      setFormatWordCount('2');
    }
  }, []);
  const buildFormatRule = useCallback((): AnswerRule | null => {
    if (formatRuleKind === 'starts_with_letter') {
      const letter = formatLetter.trim().slice(0, 1).toUpperCase();
      if (!letter) return null;
      return { type: 'starts_with_letter', letter };
    }
    const count = parseInt(formatWordCount, 10);
    if (!Number.isFinite(count) || count < 1) return null;
    return { type: 'exact_word_count', count };
  }, [formatRuleKind, formatLetter, formatWordCount]);
  const bodyValidation = useMemo(() => minLength(body, BODY_MIN), [body]);
  const filledOptions = useMemo(
    () => optionRows.map((o) => o.trim()).filter(Boolean),
    [optionRows],
  );
  const optionsValidation = useMemo(() => {
    if (!needsOptions) return { ok: true as const };
    if (filledOptions.length >= 2) return { ok: true as const };
    return {
      ok: false as const,
      message: `Add at least two choices (${filledOptions.length}/2).`,
    };
  }, [needsOptions, filledOptions.length]);
  const formatValidation = useMemo(() => {
    if (!needsFormatRule) return { ok: true as const };
    return buildFormatRule()
      ? { ok: true as const }
      : { ok: false as const, message: 'Set a valid format rule.' };
  }, [needsFormatRule, buildFormatRule]);

  const canSubmit = bodyValidation.ok && optionsValidation.ok && formatValidation.ok && !saving;

  const bodyHint =
    body.trim().length === 0
      ? `At least ${BODY_MIN} characters`
      : `${body.trim().length}/${BODY_MIN} min`;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: {
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.xxl,
          gap: Spacing.lg,
        },
        header: {
          paddingTop: Spacing.md,
          alignItems: 'center',
          gap: Spacing.xs,
        },
        headerTitle: { textAlign: 'center', letterSpacing: -0.5 },
        headerSubtitle: { textAlign: 'center', lineHeight: 18, maxWidth: 300 },
        formCard: {
          gap: Spacing.lg,
          ...Shadows.card,
        },
        typeHero: {
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
        },
        typeChipScroll: {
          flexGrow: 1,
          justifyContent: 'center',
          gap: Spacing.sm,
          paddingVertical: 2,
        },
        typeChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: Spacing.md,
          borderRadius: Radius.full,
          borderWidth: 1.5,
        },
        typeHint: {
          textAlign: 'center',
          lineHeight: 18,
          paddingHorizontal: Spacing.sm,
        },
        sectionBlock: { gap: Spacing.sm },
        sectionLabel: { textAlign: 'center' },
        sectionHint: { textAlign: 'center', lineHeight: 18 },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginVertical: -Spacing.xs,
        },
        bodyInput: {
          minHeight: 120,
          textAlignVertical: 'top',
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.md,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.md,
        },
        optionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        optionInput: {
          flex: 1,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm + 2,
          color: colors.text,
          backgroundColor: colors.background,
        },
        ruleRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: Spacing.sm,
        },
        ruleChip: {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.full,
          borderWidth: 1.5,
        },
        formatControl: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          flexWrap: 'wrap',
        },
        letterInput: {
          width: 52,
          height: 52,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.background,
          textAlign: 'center',
          fontSize: 22,
          fontWeight: '700',
        },
        stepperBtn: {
          width: 40,
          height: 40,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        },
        addOptionBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.xs,
          paddingVertical: Spacing.xs,
        },
        iconBtn: {
          padding: Spacing.sm,
        },
        tipCard: {
          ...Shadows.card,
        },
        tipText: { textAlign: 'center', lineHeight: 20 },
      }),
    [colors],
  );

  const addOption = () => {
    Haptics.selectionAsync();
    setOptionRows((r) => [...r, '']);
  };

  const removeOption = (index: number) => {
    Haptics.selectionAsync();
    setOptionRows((r) => (r.length <= 2 ? r : r.filter((_, i) => i !== index)));
  };

  const setOptionAt = (index: number, text: string) => {
    setOptionRows((r) => r.map((v, i) => (i === index ? text : v)));
  };

  const submit = async () => {
    setSubmitFeedback(null);
    const text = body.trim();
    if (!bodyValidation.ok) {
      setSubmitFeedback({ tone: 'error', message: bodyValidation.message });
      return;
    }

    const bodyFilter = filterContent(text);
    if (!bodyFilter.ok) {
      setSubmitFeedback({ tone: 'error', message: bodyFilter.reason });
      return;
    }

    let options: string[] = [];
    let answerRule: AnswerRule | null = null;
    if (needsOptions) {
      options = filledOptions;
      if (!optionsValidation.ok) {
        setSubmitFeedback({ tone: 'error', message: optionsValidation.message });
        return;
      }
      const rejectedOption = options.map(filterContent).find((result) => !result.ok);
      if (rejectedOption && !rejectedOption.ok) {
        setSubmitFeedback({ tone: 'error', message: rejectedOption.reason });
        return;
      }
    }
    if (needsFormatRule) {
      answerRule = buildFormatRule();
      if (!answerRule) {
        setSubmitFeedback({ tone: 'error', message: formatValidation.message ?? 'Set a valid format rule.' });
        return;
      }
    }

    if (!userId) return;
    setSaving(true);
    try {
      const suggestionOptions =
        needsFormatRule && answerRule ? { answer_rule: answerRule } : options;
      const hashPayload = JSON.stringify({ kind, body: text, options: suggestionOptions });
      const bodyHash = hashSuggestionBody(hashPayload);
      const { error: sugErr } = await executeCommand('submit_challenge_suggestion', {
        p_kind: kind,
        p_body: text,
        p_body_hash: bodyHash,
        p_options: suggestionOptions,
        p_idempotency_key: newCommandId('suggestion-submit'),
      });
      if (sugErr) {
        if (sugErr.code === '23505') {
          setSubmitFeedback({
            tone: 'info',
            title: 'This idea is already in the pool',
            message: 'Thanks — identical submissions are grouped together.',
          });
        } else {
          throw sugErr;
        }
        return;
      }

      Toast.show({ type: 'success', text1: 'Thanks! Your idea was submitted.' });
      setBody('');
      resetOptionsForKind(kind);
    } catch {
      setSubmitFeedback({ tone: 'error', message: 'Could not submit your idea. Try again later.' });
    } finally {
      setSaving(false);
    }
  };

  const SelectedKindIcon = selectedKind.Icon;

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <AppKeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="displayMedium" style={styles.headerTitle}>
            Suggest a challenge
          </Text>
          <Text variant="micro" color={colors.textTertiary} style={styles.headerSubtitle}>
            Ideas go into the community pool for future daily Dojis.
          </Text>
        </View>

        <Card style={styles.formCard}>
          <View style={[styles.typeHero, { backgroundColor: colors.primaryPale }]}>
            <SelectedKindIcon size={28} color={colors.primary} />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.typeChipScroll}
            keyboardShouldPersistTaps="handled"
          >
            {KINDS.map((k) => {
              const active = k.key === kind;
              const KindIcon = k.Icon;
              return (
                <TouchableOpacity
                  key={k.key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setKind(k.key);
                    resetOptionsForKind(k.key);
                  }}
                  activeOpacity={0.85}
                  style={[
                    styles.typeChip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primaryLight : colors.surfaceMuted,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={k.label}
                >
                  <KindIcon size={16} color={active ? colors.primary : colors.textSecondary} />
                  <Text
                    variant="micro"
                    color={active ? colors.primary : colors.textSecondary}
                    style={{ fontWeight: active ? '700' : '600' }}
                  >
                    {k.shortLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text variant="micro" color={colors.textTertiary} style={styles.typeHint}>
            {selectedKind.hint}
          </Text>

          <View style={styles.divider} />

          <View style={styles.sectionBlock}>
            <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
              {needsOptions || needsFormatRule ? 'Your question' : 'Your idea'}
            </Text>
            <Text variant="micro" color={colors.textTertiary} style={styles.sectionHint}>
              {needsOptions
                ? 'What should everyone vote on?'
                : needsFormatRule
                  ? 'Ask the question, then set the format rule below.'
                  : 'Describe the challenge in a sentence or two.'}
            </Text>
            <Input
              value={body}
              onChangeText={setBody}
              placeholder={
                needsOptions ? 'e.g. Best snack for a road trip?' : 'Describe your challenge…'
              }
              multiline
              editable={!saving}
              style={styles.bodyInput}
              error={body.trim().length > 0 ? validationMessage(bodyValidation) : undefined}
              hint={bodyHint}
              success={
                bodyValidation.ok && body.trim().length >= BODY_MIN ? 'Looks good' : undefined
              }
            />
          </View>

          {needsOptions ? (
            <>
              <View style={styles.divider} />
              <View style={styles.sectionBlock}>
                <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
                  Answer choices
                </Text>
                <Text variant="micro" color={colors.textTertiary} style={styles.sectionHint}>
                  At least two options
                </Text>
                {optionRows.map((row, i) => (
                  <View key={`opt-${i}`} style={styles.optionRow}>
                    <AppTextInput
                      style={[styles.optionInput, { flex: 1 }]}
                      value={row}
                      onChangeText={(t) => setOptionAt(i, t)}
                      placeholder={`Option ${i + 1}`}
                      placeholderTextColor={colors.textTertiary}
                      editable={!saving}
                    />
                    {optionRows.length > 2 ? (
                      <TouchableOpacity
                        onPress={() => removeOption(i)}
                        style={styles.iconBtn}
                        accessibilityLabel={`Remove option ${i + 1}`}
                      >
                        <IconClose size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ) : (
                      <View style={{ width: 36 }} />
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  onPress={addOption}
                  style={styles.addOptionBtn}
                  activeOpacity={0.85}
                >
                  <IconPlus size={20} color={colors.primary} />
                  <Text variant="label" color={colors.primary}>
                    Add option
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {needsFormatRule ? (
            <>
              <View style={styles.divider} />
              <View style={styles.sectionBlock}>
                <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
                  Answer format
                </Text>
                <Text variant="micro" color={colors.textTertiary} style={styles.sectionHint}>
                  Everyone&apos;s reply must follow this rule
                </Text>
                <View style={styles.ruleRow}>
                  {(
                    [
                      { key: 'exact_word_count' as const, label: 'Word count' },
                      { key: 'starts_with_letter' as const, label: 'Starts with letter' },
                    ] as const
                  ).map((r) => {
                    const active = formatRuleKind === r.key;
                    return (
                      <TouchableOpacity
                        key={r.key}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setFormatRuleKind(r.key);
                        }}
                        style={[
                          styles.ruleChip,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primaryLight : colors.surfaceMuted,
                          },
                        ]}
                      >
                        <Text
                          variant="micro"
                          color={active ? colors.primary : colors.textSecondary}
                          style={{ fontWeight: '700' }}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {formatRuleKind === 'starts_with_letter' ? (
                  <View style={styles.formatControl}>
                    <Text variant="bodySmall" color={colors.textSecondary}>
                      Must start with
                    </Text>
                    <AppTextInput
                      style={styles.letterInput}
                      value={formatLetter}
                      onChangeText={(t) => setFormatLetter(t.slice(0, 1))}
                      maxLength={1}
                      autoCapitalize="characters"
                      editable={!saving}
                    />
                  </View>
                ) : (
                  <View style={styles.formatControl}>
                    <Text variant="bodySmall" color={colors.textSecondary}>
                      Exactly
                    </Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() =>
                        setFormatWordCount(
                          String(Math.max(1, parseInt(formatWordCount, 10) - 1 || 1)),
                        )
                      }
                      accessibilityLabel="Decrease word count"
                    >
                      <Text variant="headingMedium">−</Text>
                    </TouchableOpacity>
                    <Text variant="headingMedium" style={{ minWidth: 28, textAlign: 'center' }}>
                      {formatWordCount}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() =>
                        setFormatWordCount(
                          String(Math.min(20, (parseInt(formatWordCount, 10) || 1) + 1)),
                        )
                      }
                      accessibilityLabel="Increase word count"
                    >
                      <Text variant="headingMedium">+</Text>
                    </TouchableOpacity>
                    <Text variant="bodySmall" color={colors.textSecondary}>
                      words
                    </Text>
                  </View>
                )}
                {!formatValidation.ok && body.trim().length >= BODY_MIN ? (
                  <Text variant="bodySmall" color={colors.error} style={{ textAlign: 'center' }}>
                    {formatValidation.message}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </Card>

        {submitFeedback ? <InlineFeedback {...submitFeedback} /> : null}

        <Button
          onPress={() => void submit()}
          loading={saving}
          disabled={!canSubmit}
          size="lg"
          fullWidth
        >
          Submit to pool
        </Button>

        <Card style={styles.tipCard}>
          <Text variant="bodySmall" color={colors.textSecondary} style={styles.tipText}>
            Earn the Pitch Perfect badge when you submit. If your idea is picked for a daily Doji,
            you&apos;ll unlock Spotlight.
          </Text>
        </Card>
      </AppKeyboardAwareScrollView>
    </SafeAreaView>
  );
}
