import React from 'react';
import { View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { formatBirthDateInput } from '@/lib/ageAssurance';

type Props = {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export function SignupAgeStep({ value, error, onChange, onBlur }: Props) {
  const { colors } = useTheme();

  return (
    <>
      <Text variant="displayMedium">What’s your birthday?</Text>
      <Text variant="body" color={colors.textSecondary}>
        You must be at least 13 to use Doji. We keep the birthday you enter as a private
        record of your age verification.
      </Text>
      <View style={{ gap: Spacing.md, marginTop: Spacing.sm }}>
        <Input
          label="Date of birth"
          placeholder="MM/DD/YYYY"
          value={value}
          onChangeText={(next) => onChange(formatBirthDateInput(next))}
          onBlur={onBlur}
          keyboardType="number-pad"
          autoComplete="birthdate-full"
          textContentType="none"
          maxLength={10}
          hint="Your birthday is private and never appears on your profile."
          error={error}
        />
      </View>
    </>
  );
}
