import type { AnswerRule } from '../types/database';

export type AnswerRuleValidation = { ok: true } | { ok: false; message: string };

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function parseAnswerRule(raw: unknown): AnswerRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.type === 'starts_with_letter' && typeof o.letter === 'string') {
    const letter = o.letter.trim().slice(0, 1).toUpperCase();
    if (!letter) return null;
    return { type: 'starts_with_letter', letter };
  }
  if (o.type === 'exact_word_count') {
    const count = typeof o.count === 'number' ? o.count : Number(o.count);
    if (!Number.isFinite(count) || count < 1) return null;
    return { type: 'exact_word_count', count: Math.floor(count) };
  }
  return null;
}

export function formatRuleHint(rule: AnswerRule): string {
  switch (rule.type) {
    case 'starts_with_letter':
      return `Must start with ${rule.letter}`;
    case 'exact_word_count':
      return rule.count === 1
        ? 'Answer in exactly 1 word'
        : `Answer in exactly ${rule.count} words`;
    default:
      return '';
  }
}

export function validateAnswerRule(answer: string, rule: AnswerRule): AnswerRuleValidation {
  const text = answer.trim();
  if (!text) {
    return { ok: false, message: 'Enter an answer first.' };
  }

  if (rule.type === 'starts_with_letter') {
    const expected = rule.letter.toUpperCase();
    const actual = text.slice(0, 1).toUpperCase();
    if (actual !== expected) {
      return { ok: false, message: `Your answer must start with ${expected}.` };
    }
    return { ok: true };
  }

  if (rule.type === 'exact_word_count') {
    const count = wordCount(text);
    if (count !== rule.count) {
      const noun = rule.count === 1 ? 'word' : 'words';
      return {
        ok: false,
        message: `Use exactly ${rule.count} ${noun} (you have ${count}).`,
      };
    }
    return { ok: true };
  }

  return { ok: false, message: 'Invalid answer format.' };
}
