import {
  formatRuleHint,
  parseAnswerRule,
  validateAnswerRule,
} from '../../lib/answerRules';

describe('parseAnswerRule', () => {
  it('parses starts_with_letter', () => {
    expect(parseAnswerRule({ type: 'starts_with_letter', letter: 's' })).toEqual({
      type: 'starts_with_letter',
      letter: 'S',
    });
  });

  it('parses exact_word_count', () => {
    expect(parseAnswerRule({ type: 'exact_word_count', count: 2 })).toEqual({
      type: 'exact_word_count',
      count: 2,
    });
  });

  it('returns null for invalid payloads', () => {
    expect(parseAnswerRule(null)).toBeNull();
    expect(parseAnswerRule({ type: 'unknown' })).toBeNull();
  });
});

describe('formatRuleHint', () => {
  it('formats letter rule', () => {
    expect(formatRuleHint({ type: 'starts_with_letter', letter: 'S' })).toBe('Must start with S');
  });

  it('formats word count rule', () => {
    expect(formatRuleHint({ type: 'exact_word_count', count: 2 })).toBe('Answer in exactly 2 words');
  });
});

describe('validateAnswerRule', () => {
  it('accepts matching letter', () => {
    expect(
      validateAnswerRule('Sunshine', { type: 'starts_with_letter', letter: 'S' }),
    ).toEqual({ ok: true });
  });

  it('rejects wrong starting letter', () => {
    const result = validateAnswerRule('moon', { type: 'starts_with_letter', letter: 'S' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('S');
  });

  it('accepts exact word count', () => {
    expect(
      validateAnswerRule('calm happy tired', { type: 'exact_word_count', count: 3 }),
    ).toEqual({ ok: true });
  });

  it('rejects wrong word count', () => {
    const result = validateAnswerRule('one two three four', { type: 'exact_word_count', count: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('2');
  });

  it('rejects empty answer', () => {
    expect(validateAnswerRule('  ', { type: 'exact_word_count', count: 1 }).ok).toBe(false);
  });
});
