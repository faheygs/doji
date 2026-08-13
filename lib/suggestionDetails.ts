export function suggestionOptionLabels(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function suggestionRuleLabel(options: unknown): string | null {
  if (!options || Array.isArray(options) || typeof options !== 'object') return null;
  const rule = (options as { answer_rule?: unknown }).answer_rule;
  if (!rule || typeof rule !== 'object') return null;
  const typed = rule as { type?: string; letter?: string; count?: number };
  if (typed.type === 'starts_with_letter' && typed.letter) return `Answer starts with ${typed.letter.toUpperCase()}`;
  if (typed.type === 'exact_word_count' && typed.count) return `Exactly ${typed.count} words`;
  return null;
}
