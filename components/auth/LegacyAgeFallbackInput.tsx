import React from 'react';
import { Input } from '@/components/ui/Input';
import { formatBirthDateInput } from '@/lib/ageAssurance';

type Props = {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

/** Compatibility only for an unfinished account created before the pre-auth age gate. */
export function LegacyAgeFallbackInput({ value, error, onChange, onBlur }: Props) {
  return (
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
      hint="Required because this account was started in an older version of Doji."
      error={error}
    />
  );
}
