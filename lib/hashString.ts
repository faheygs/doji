/** Stable short hash for deduping suggestion text (not cryptographic). */
export function hashSuggestionBody(input: string): string {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return `h${(h >>> 0).toString(16)}`;
}
