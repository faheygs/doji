/** Sparks economy constants — keep in sync with DB seed / RPC defaults. */

/** Enough to get started in the shop — not enough to buy everything. */
export const SPARKS_WELCOME_BONUS = 200;

/** Most expensive spend — not sold in the shop. */
export const SPARKS_BUY_IN_COST = 400;

/** Participation rewards (mirror DB triggers). */
export const SPARKS_POST = 10;
export const SPARKS_COMMENT = 3;
export const SPARKS_REACTION = 2;
export const SPARKS_POLL_VOTE = 5;
export const SPARKS_SUGGESTION_APPROVED = 15;
export const SPARKS_FRIEND_REQUEST = 2;
export const SPARKS_FRIEND_ACCEPT = 5;

/**
 * Earn rules (idempotent where noted):
 * - Photo / question post: each post (SPARKS_POST)
 * - Poll vote: each challenge voted in (SPARKS_POLL_VOTE)
 * - Suggestion approved: each approval (SPARKS_SUGGESTION_APPROVED)
 * - Comment / reaction: first on a given post only
 * - Challenge complete / level up / badges: separate triggers
 */

/** ~20% of XP reward per challenge; buy-in completions earn half. */
export function sparksForXp(xpReward: number): number {
  return Math.max(1, Math.floor(xpReward / 5));
}

export function sparksForLevel(level: number): number {
  return 5 * Math.max(level, 1);
}

export function sparksForBadgeTier(tier: string): number {
  switch (tier) {
    case 'bronze':
      return 8;
    case 'silver':
      return 15;
    case 'gold':
      return 30;
    case 'diamond':
      return 60;
    default:
      return 0;
  }
}
