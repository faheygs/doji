/**
 * Content filter for user-submitted text.
 *
 * Two tiers:
 *  SEVERE  - substring-matched on both the normalised string and the compacted
 *            (no-space) form, catching spaced-out spellings like "n i g g e r".
 *            Only includes strings that cannot appear in innocent words.
 *  PROFANITY - word-boundary matched to avoid false positives like "class" for "ass".
 */

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a',
  '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '+': 't', '|': 'l',
  '(': 'c', ')': 'o', '<': 'c',
};

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    // Leet substitutions
    .split('').map((c) => LEET[c] ?? c).join('')
    // Collapse 3+ repeated chars to 1: "fuuuuck" → "fuck", "shiiit" → "shit"
    // Double chars (e.g. "ss" in "ass", "asshole") are left alone — they don't
    // trigger this rule and are listed verbatim in PROFANITY.
    .replace(/(.)\1{2,}/g, '$1')
    // Replace non-alpha with space
    .replace(/[^a-z]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// After 3+ collapse only — keep common evasion variants in the list.
// These strings don't appear as substrings of legitimate English words.
const SEVERE = [
  // n-word variants
  'nigger', 'nigga',
  // f-slur
  'faggot', 'fagot',
  // other ethnic/racial slurs safe for substring matching
  'kike', 'wetback', 'gook', 'chink', 'tranny', 'trany',
  // ableist slur — "retard" in any context on a social app
  'retard',
];

// Profanity checked at word boundaries only.
const PROFANITY = new Set([
  // common swearing
  'fuck', 'fucker', 'fucking',
  'shit', 'shitting', 'bullshit',
  'bitch', 'bitching',
  'cunt',
  'dick', 'prick', 'cock',
  'pussy',
  'ass', 'asshole',
  'bastard',
  'whore', 'slut',
  'piss', 'pissing',
  'wanker', 'twat',
  'motherfucker', 'motherfucking',
  // slurs that need word-boundary matching to avoid false positives
  'fag',           // "fag" alone; "faggot" caught by SEVERE
  'spic',          // "spic" in "specific" — word boundary avoids it
  'coon',          // "coon" in "raccoon" — word boundary avoids it
  'paki',          // "paki" in "pakistan" — word boundary avoids it
  'niga',          // "niga" in "shenanigans"/"shannanigans" — word boundary avoids it
  'niger',         // "niger" in "Nigeria"/"Nigerian" — word boundary avoids it
  // literal evasions
  'nword', 'cword', 'fword',
]);

export type FilterResult = { ok: true } | { ok: false; reason: string };

export function filterContent(text: string): FilterResult {
  if (!text || !text.trim()) return { ok: true };

  const norm = normalize(text);
  const compact = norm.replace(/\s/g, '');

  for (const word of SEVERE) {
    if (norm.includes(word) || compact.includes(word)) {
      return { ok: false, reason: 'Your message contains prohibited language.' };
    }
  }

  const words = norm.split(' ');
  for (const word of words) {
    if (PROFANITY.has(word)) {
      return { ok: false, reason: 'Your message contains prohibited language.' };
    }
  }

  return { ok: true };
}
