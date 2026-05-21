import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconPlus, IconClose } from '@/components/icons/Icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { hashSuggestionBody } from '@/lib/hashString';
import type { Challenge } from '@/types/database';

const KINDS = [
  { key: 'poll' as const, label: 'Poll', hint: 'Two or more choices; everyone votes for one.' },
  { key: 'wyr' as const, label: 'Would you rather', hint: 'Two (or more) contrasting options.' },
  { key: 'question' as const, label: 'Question', hint: 'Open prompt — others answer in text.' },
  { key: 'photo_idea' as const, label: 'Photo idea', hint: 'Something people snap a picture for.' },
];

type KindKey = (typeof KINDS)[number]['key'];

function mapKindToChallengeRow(kind: KindKey): {
  type: Challenge['type'];
  category: Challenge['category'];
  requires_photo: boolean;
  requires_video: boolean;
  requires_text: boolean;
  emoji: string;
} {
  switch (kind) {
    case 'poll':
    case 'wyr':
      return {
        type: 'poll',
        category: 'social',
        requires_photo: false,
        requires_video: false,
        requires_text: false,
        emoji: '📊',
      };
    case 'question':
      return {
        type: 'task',
        category: 'mental',
        requires_photo: false,
        requires_video: false,
        requires_text: true,
        emoji: '❓',
      };
    case 'photo_idea':
      return {
        type: 'photo',
        category: 'creative',
        requires_photo: true,
        requires_video: false,
        requires_text: false,
        emoji: '📷',
      };
  }
}

function emptyOptionRows(n: number): string[] {
  return Array.from({ length: n }, () => '');
}

export default function SuggestChallengeScreen() {
  const { colors } = useTheme();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [kind, setKind] = useState<KindKey>('poll');
  const [body, setBody] = useState('');
  const [optionRows, setOptionRows] = useState<string[]>(() => emptyOptionRows(2));
  const [saving, setSaving] = useState(false);

  const needsOptions = kind === 'poll' || kind === 'wyr';

  const resetOptionsForKind = useCallback((k: KindKey) => {
    if (k === 'poll' || k === 'wyr') {
      setOptionRows(emptyOptionRows(2));
    } else {
      setOptionRows([]);
    }
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: Spacing.xxl },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        },
        section: { paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm },
        kindList: { gap: Spacing.xs },
        kindOption: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.md,
          borderRadius: Radius.md,
          borderWidth: 2,
          width: '100%',
        },
        radioOuter: {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        radioInner: {
          width: 10,
          height: 10,
          borderRadius: 5,
        },
        kindTextBlock: { flex: 1, minWidth: 0, gap: 2 },
        input: {
          minHeight: 100,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: Spacing.md,
          color: colors.text,
          backgroundColor: colors.surface,
          textAlignVertical: 'top',
        },
        optionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          marginBottom: Spacing.sm,
        },
        optionInput: {
          flex: 1,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          color: colors.text,
          backgroundColor: colors.surface,
        },
        iconBtn: {
          padding: Spacing.sm,
        },
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
    const text = body.trim();
    if (text.length < 8) {
      Toast.show({ type: 'error', text1: 'Please add a clearer prompt (8+ characters).' });
      return;
    }

    let options: string[] = [];
    if (needsOptions) {
      options = optionRows.map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) {
        Toast.show({ type: 'error', text1: 'Add at least two answer choices.' });
        return;
      }
    }

    if (!userId) return;
    setSaving(true);
    try {
      const hashPayload = JSON.stringify({ kind, body: text, options });
      const bodyHash = hashSuggestionBody(hashPayload);
      const { error: sugErr } = await supabase.from('challenge_suggestions').insert({
        user_id: userId,
        kind,
        body: text,
        body_hash: bodyHash,
        options,
      });
      if (sugErr) {
        if (sugErr.code === '23505') {
          Toast.show({
            type: 'info',
            text1: 'This idea is already in the pool',
            text2: 'Thanks — we dedupe identical submissions.',
          });
        } else {
          throw sugErr;
        }
        return;
      }

      const mapped = mapKindToChallengeRow(kind);
      const { data: draft, error: chErr } = await supabase
        .from('challenges')
        .insert({
          title: text.slice(0, 200),
          description: text,
          type: mapped.type,
          category: mapped.category,
          difficulty: 2,
          xp_reward: 50,
          requires_photo: mapped.requires_photo,
          requires_video: mapped.requires_video,
          requires_text: mapped.requires_text,
          is_active: true,
          schedule_count: 0,
          emoji: mapped.emoji,
          participant_count: 0,
        })
        .select('id')
        .single();

      if (chErr || !draft?.id) {
        Toast.show({
          type: 'info',
          text1: 'Thanks! Your idea was saved to the pool.',
          text2: 'We could not add it to the live challenge list — try again later.',
        });
        setBody('');
        resetOptionsForKind(kind);
        return;
      }

      if (mapped.type === 'poll' && options.length >= 2) {
        const pollRows = options.map((opt, i) => ({
          challenge_id: draft.id,
          text: opt.slice(0, 200),
          position: i,
          vote_count: 0,
        }));
        const { error: poErr } = await supabase.from('poll_options').insert(pollRows);
        if (poErr) {
          await supabase.from('challenges').delete().eq('id', draft.id);
          Toast.show({
            type: 'info',
            text1: 'Idea saved to the pool',
            text2: 'Poll choices failed to save — try again or contact support.',
          });
          setBody('');
          resetOptionsForKind(kind);
          return;
        }
      }

      Toast.show({ type: 'success', text1: 'Thanks! Your idea was submitted.' });
      setBody('');
      resetOptionsForKind(kind);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not submit — try again later.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="headingLarge">Suggest a challenge</Text>
          <Text variant="micro" color={colors.textTertiary} style={{ marginTop: 4 }}>
            Ideas go into the community pool for future daily Dojis.
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="headingMedium">Type</Text>
          <Text variant="micro" color={colors.textTertiary}>
            Tap a row to choose. Poll and Would you rather need answer choices below.
          </Text>
          <View style={styles.kindList}>
            {KINDS.map((k) => {
              const active = k.key === kind;
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
                    styles.kindOption,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primaryLight : colors.surface,
                      shadowColor: active ? colors.primary : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: active ? 0.2 : 0,
                      shadowRadius: active ? 4 : 0,
                      elevation: active ? 2 : 0,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      {
                        borderColor: active ? colors.primary : colors.textTertiary,
                      },
                    ]}
                  >
                    {active ? (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    ) : null}
                  </View>
                  <View style={styles.kindTextBlock}>
                    <Text variant="body" color={active ? colors.primary : colors.text} style={{ fontWeight: active ? '800' : '600' }}>
                      {k.label}
                    </Text>
                    <Text variant="micro" color={colors.textTertiary}>
                      {k.hint}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="headingMedium">{needsOptions ? 'Question' : 'Your idea'}</Text>
          <Text variant="micro" color={colors.textTertiary}>
            {needsOptions
              ? 'What should everyone vote on? Then add the answer choices below.'
              : 'Describe the challenge in a sentence or two.'}
          </Text>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder={needsOptions ? 'e.g. Best snack for a road trip?' : 'Describe your challenge…'}
            placeholderTextColor={colors.textTertiary}
            multiline
            editable={!saving}
          />
        </View>

        {needsOptions ? (
          <View style={styles.section}>
            <Text variant="headingMedium">Answers</Text>
            <Text variant="micro" color={colors.textTertiary}>
              At least two options. Tap + to add another.
            </Text>
            {optionRows.map((row, i) => (
              <View key={`opt-${i}`} style={styles.optionRow}>
                <Text variant="label" color={colors.textTertiary} style={{ width: 28 }}>
                  {i + 1}.
                </Text>
                <TextInput
                  style={styles.optionInput}
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
                  <View style={{ width: 40 }} />
                )}
              </View>
            ))}
            <TouchableOpacity
              onPress={addOption}
              style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start' }}
            >
              <IconPlus size={22} color={colors.primary} />
              <Text variant="label" color={colors.primary}>
                Add option
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.section, { paddingHorizontal: Spacing.lg }]}>
          <Button onPress={() => void submit()} loading={saving} disabled={saving} size="md">
            Submit to pool
          </Button>
        </View>

        <View style={styles.section}>
          <Card style={{ padding: Spacing.md }}>
            <Text variant="bodySmall" color={colors.textSecondary}>
              Earn the Pitch Perfect badge when you submit. If your idea is picked for a daily Doji, you&apos;ll unlock
              Spotlight.
            </Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
