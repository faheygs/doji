import React, { useCallback } from 'react';
import { BackHandler, TouchableOpacity } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { IconChevronLeft } from '../icons/Icons';

type Props = { mode: 'signIn' | 'signUp'; onReturnToSignIn: () => void };

export function AuthModeBackButton({ mode, onReturnToSignIn }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const goBack = useCallback(() => {
    if (mode === 'signUp') onReturnToSignIn();
    else router.back();
  }, [mode, onReturnToSignIn, router]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode !== 'signUp') return false;
        onReturnToSignIn();
        return true;
      });
      return () => subscription.remove();
    }, [mode, onReturnToSignIn]),
  );

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: mode === 'signIn' }} />
      <TouchableOpacity
        onPress={goBack}
        hitSlop={16}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <IconChevronLeft size={24} color={colors.textSecondary} />
      </TouchableOpacity>
    </>
  );
}
