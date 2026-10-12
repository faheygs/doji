// LOCAL PREPARATION ONLY. No provider, mail sender, database adapter, route or session grant.
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  assertEmailAttempt,
  EMAIL_DRAFT_POLICY as policy,
} from './portal-email-challenge-contracts.mts';
import type {
  EmailAttempt,
  EmailChallengeStore,
  EmailState,
  EmailObservation,
} from './portal-email-challenge-contracts.mts';

type Issue =
  | { kind: 'issued'; challengeId: string; code: string }
  | { kind: 'replayed'; challengeId: string }
  | { kind: 'denied' };
type Check = { kind: 'verified'; observation: EmailObservation } | { kind: 'denied' };
const denied = { kind: 'denied' } as const;
/** Caller must derive EmailAttempt from a server-verified first factor, never request JSON.
 * The returned code is for an eventual server-side delivery adapter, NEVER an API response.
 * A successful observation is deliberately NOT an aal2/mfaVerified/session authorization.
 */
export function createPortalEmailChallengeDraft(
  secret: Uint8Array,
  store: EmailChallengeStore,
  now = Date.now,
) {
  if (secret.byteLength < 32) throw Error('Draft verification key required.');
  const key = Buffer.from(secret);
  const mac = (purpose: string, parts: unknown[]) =>
    createHmac('sha256', key)
      .update(JSON.stringify([purpose, ...parts]))
      .digest('hex');
  const actorKey = (a: EmailAttempt) =>
    mac('actor', [a.realm, a.origin, a.issuer, a.audience, a.subject]);
  const binding = (a: EmailAttempt) =>
    mac('binding', [
      a.realm,
      a.origin,
      a.issuer,
      a.audience,
      a.subject,
      a.attemptId,
      a.browserHash,
      a.verifiedEmailHash,
      a.passwordVerifiedAtMs,
    ]);
  const codeMac = (id: string, bound: string, code: string) => mac('code', [id, bound, code]);
  function bucket(saved: EmailState | null, at: number): EmailState {
    if (saved && at < saved.windowAtMs) throw Error('Portal email verification unavailable.');
    return !saved || at - saved.windowAtMs >= policy.windowMs
      ? { windowAtMs: at, lastIssuedAtMs: 0, sends: 0, attempts: 0, challenge: null }
      : structuredClone(saved);
  }
  return Object.freeze({
    async issue(attempt: EmailAttempt, requestId: string): Promise<Issue> {
      assertEmailAttempt(attempt, now());
      if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(requestId)) return denied;
      return store.transact<Issue>(actorKey(attempt), (saved) => {
        const at = now();
        assertEmailAttempt(attempt, at);
        const state = bucket(saved, at),
          bound = binding(attempt);
        if (state.challenge?.requestId === requestId)
          return {
            state,
            result:
              state.challenge.binding === bound
                ? { kind: 'replayed', challengeId: state.challenge.id }
                : denied,
          };
        if (
          state.sends >= policy.sendsPerWindow ||
          state.attempts >= policy.attemptsPerWindow ||
          (state.sends > 0 && at - state.lastIssuedAtMs < policy.resendMs)
        )
          return { state, result: denied };
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0'),
          id = randomUUID();
        state.sends++;
        state.lastIssuedAtMs = at;
        state.challenge = {
          id,
          requestId,
          binding: bound,
          codeMac: codeMac(id, bound, code),
          expiresAtMs: Math.min(
            at + policy.challengeMs,
            attempt.passwordVerifiedAtMs + policy.firstFactorMs,
          ),
          deliveredToProvider: false,
          consumed: false,
        };
        return { state, result: { kind: 'issued', challengeId: id, code } };
      });
    },
    async providerAccepted(attempt: EmailAttempt, challengeId: string): Promise<boolean> {
      assertEmailAttempt(attempt, now());
      return store.transact(actorKey(attempt), (saved) => {
        const at = now();
        assertEmailAttempt(attempt, at);
        const state = bucket(saved, at),
          challenge = state.challenge;
        const accepted =
          !!challenge &&
          challenge.id === challengeId &&
          challenge.binding === binding(attempt) &&
          !challenge.consumed &&
          challenge.expiresAtMs > at;
        if (accepted) challenge.deliveredToProvider = true;
        return { state, result: accepted };
      });
    },
    async verify(attempt: EmailAttempt, challengeId: string, code: string): Promise<Check> {
      assertEmailAttempt(attempt, now());
      return store.transact<Check>(actorKey(attempt), (saved) => {
        const at = now();
        assertEmailAttempt(attempt, at);
        const state = bucket(saved, at),
          challenge = state.challenge,
          bound = binding(attempt);
        if (
          !challenge ||
          challenge.id !== challengeId ||
          challenge.binding !== bound ||
          challenge.consumed ||
          !challenge.deliveredToProvider ||
          challenge.expiresAtMs <= at ||
          state.attempts >= policy.attemptsPerWindow
        )
          return { state, result: denied };
        state.attempts++;
        if (
          !/^\d{6}$/.test(code) ||
          !timingSafeEqual(
            Buffer.from(challenge.codeMac, 'hex'),
            Buffer.from(codeMac(challenge.id, bound, code), 'hex'),
          )
        )
          return { state, result: denied };
        challenge.consumed = true;
        challenge.codeMac = '';
        return {
          state,
          result: {
            kind: 'verified',
            observation: Object.freeze({
              method: 'email-code',
              purpose: 'portal-email-step-up',
              realm: attempt.realm,
              subject: attempt.subject,
              audience: attempt.audience,
              issuer: attempt.issuer,
              attemptId: attempt.attemptId,
              browserHash: attempt.browserHash,
              verifiedEmailHash: attempt.verifiedEmailHash,
              verifiedAtMs: at,
              expiresAtMs: challenge.expiresAtMs,
            }),
          },
        };
      });
    },
  });
}
