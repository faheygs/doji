'use client';

import { useEffect, useId, useRef } from 'react';
import { TextField } from '@mui/material';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
};

export function VerificationCode({
  value,
  onChange,
  label = 'Verification code',
  helperText = 'Enter the 6-digit code. You can also paste it.',
  disabled = false,
  error = false,
  autoFocus = false,
}: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error && !disabled) input.current?.focus();
  }, [error, disabled]);
  return (
    <TextField
      id={id}
      inputRef={input}
      name="code"
      label={label}
      helperText={helperText}
      value={value}
      onChange={(event) => {
        if (/^\d{0,6}$/.test(event.target.value)) onChange(event.target.value);
      }}
      onPaste={(event) => {
        const code = event.clipboardData.getData('text').replace(/[\s-]/g, '');
        event.preventDefault();
        if (disabled || !/^\d{1,6}$/.test(code)) return;
        const start = input.current?.selectionStart ?? value.length;
        const end = input.current?.selectionEnd ?? start;
        const next = code.length === 6 ? code : value.slice(0, start) + code + value.slice(end);
        if (next.length <= 6) onChange(next);
      }}
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      required
      fullWidth
      disabled={disabled}
      error={error}
      slotProps={{
        htmlInput: { inputMode: 'numeric', minLength: 6, maxLength: 6, pattern: '[0-9]{6}' },
      }}
    />
  );
}
