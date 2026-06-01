import { isValidEmail } from './authErrors';
import {
  formatRuleHint,
  parseAnswerRule,
  validateAnswerRule,
  type AnswerRuleValidation,
} from './answerRules';

export type FormValidation = { ok: true } | { ok: false; message: string };

export function required(text: string, message = 'This field is required.'): FormValidation {
  return text.trim().length > 0 ? { ok: true } : { ok: false, message };
}

export function minLength(text: string, n: number, message?: string): FormValidation {
  const len = text.trim().length;
  if (len >= n) return { ok: true };
  return {
    ok: false,
    message: message ?? `Use at least ${n} characters (${len}/${n}).`,
  };
}

export function maxLength(text: string, n: number, message?: string): FormValidation {
  if (text.length <= n) return { ok: true };
  return {
    ok: false,
    message: message ?? `Keep it under ${n} characters.`,
  };
}

export function validateEmailField(raw: string): FormValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: 'Enter your email address.' };
  if (!isValidEmail(trimmed)) return { ok: false, message: 'Enter a valid email address.' };
  return { ok: true };
}

export function validatePasswordField(raw: string, min = 6): FormValidation {
  if (raw.length >= min) return { ok: true };
  return { ok: false, message: `Password must be at least ${min} characters.` };
}

export function validatePasswordMatch(password: string, confirm: string): FormValidation {
  if (!confirm) return { ok: false, message: 'Confirm your password.' };
  if (password !== confirm) return { ok: false, message: 'Passwords do not match.' };
  return { ok: true };
}

export function validationMessage(v: FormValidation | null | undefined): string | undefined {
  if (!v || v.ok) return undefined;
  return v.message;
}

export { isValidEmail, formatRuleHint, parseAnswerRule, validateAnswerRule, type AnswerRuleValidation };
