import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Input } from '../../components/ui/Input';
import { IconClose } from '../../components/icons/Icons';
import { useUserEvent, useCreatePost } from '../../hooks/useUserEvent';
import { isExpired } from '../../utils/time';

export default function TaskScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: userEvent, isLoading } = useUserEvent();
  const createPost = useCreatePost();
  const [answer, setAnswer] = useState('');

  const challenge = userEvent?.challenge;

  useEffect(() => {
    if (isLoading) return;
    if (!userEvent) return;
    const t = userEvent.challenge?.type;
    if (t && t !== 'task') {
      router.replace('/(app)/challenge');
    }
  }, [isLoading, userEvent, router]);

  const handleSubmit = useCallback(async () => {
    if (!userEvent || !answer.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    createPost.mutate(
      {
        userEventId: userEvent.id,
        photoUri: null,
        frontPhotoUri: null,
        videoUri: null,
        caption: answer.trim(),
        isLate: isExpired(userEvent.expires_at),
        postType: 'task_complete',
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/(app)');
        },
        onError: (err: Error) => {
          Toast.show({ type: 'error', text1: err.message ?? 'Failed to submit' });
        },
      },
    );
  }, [userEvent, answer, createPost, router, challenge?.xp_reward]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
        },
        scroll: { flexGrow: 1 },
        content: {
          flex: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          gap: Spacing.lg,
        },
        title: { textAlign: 'center' },
        inputWrap: { flex: 1, minHeight: 120 },
        footer: { padding: Spacing.lg },
        submitButton: {
          width: '100%',
          height: 52,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={{ padding: Spacing.sm }}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text variant="displayMedium" style={styles.title}>
              {challenge?.title ?? 'Challenge'}
            </Text>

            {challenge?.description ? (
              <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                {challenge.description}
              </Text>
            ) : null}

            <View style={styles.inputWrap}>
              <Input
                placeholder="Type your answer..."
                value={answer}
                onChangeText={setAnswer}
                multiline
                autoFocus
                containerStyle={{ flex: 1 }}
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!answer.trim() || createPost.isPending}
            activeOpacity={0.85}
            style={[
              styles.submitButton,
              {
                backgroundColor: answer.trim() ? colors.primary : colors.surfaceMuted,
              },
            ]}
          >
            {createPost.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text variant="label" color={answer.trim() ? '#FFFFFF' : colors.textTertiary}>
                Submit Answer
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
