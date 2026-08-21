import React from 'react';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  prefix: string;
  centered?: boolean;
};

export function AuthLegalLinks({ prefix, centered = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Text
      variant="bodySmall"
      color={colors.textTertiary}
      style={centered ? { textAlign: 'center', lineHeight: 18 } : undefined}
    >
      {prefix}{' '}
      <Text
        variant="bodySmall"
        color={colors.link}
        onPress={() => router.push('/(auth)/terms')}
      >
        Terms of Use
      </Text>
      {' '}and{' '}
      <Text
        variant="bodySmall"
        color={colors.link}
        onPress={() => router.push('/(auth)/privacy')}
      >
        Privacy Policy
      </Text>
      .
    </Text>
  );
}
