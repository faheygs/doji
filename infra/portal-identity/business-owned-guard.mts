// LOCAL ONLY: deliberately absent from runtime composition and restricted SQL allowlist.
// The caller supplies server-verified identity/ingress, never browser identity fields.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';
import { isRecord, type BusinessActor } from './business-contracts.mts';
import type { StoreExecute } from './business-session-store.mts';
import { isVerifiedBusinessActor } from './business-http-state.mts';
import { ownedDiagnostic } from './business-owned-diagnostics.mts';
type Action = 'signin' | 'register' | 'verify' | 'mfa' | 'recover' | 'reset';
interface Policy {
  enabled: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
  admissionHmacKey: string;
  acceptanceOnly?: boolean;
}
const denied = () => Error('Business authentication unavailable.');
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function createBusinessOwnedGuard(config: Policy, execute: StoreExecute, now = Date.now) {
  const policy = Object.freeze({ ...config });
  if (
    policy.enabled !== true ||
    policy.realm !== 'business' ||
    policy.origin !== 'https://business.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId) ||
    !digest(policy.admissionHmacKey)
  )
    throw denied();
  const scope = createHash('sha256').update(`${policy.origin}|${policy.clientId}`).digest('hex');
  const issuer = `https://api.workos.com/user_management/${policy.clientId}`;
  const hmac = (kind: string, value: string) =>
    createHmac('sha256', Buffer.from(policy.admissionHmacKey, 'hex'))
      .update(`${scope}|${kind}|${value}`)
      .digest('hex');
  async function run(
    sql: string,
    params: (string | number | null)[],
    signal: AbortSignal,
  ): Promise<Record<string, unknown> & { state: string }> {
    signal.throwIfAborted();
    try {
      const result = await execute(
        'doji_business_session',
        sql,
        params,
        AbortSignal.any([signal, AbortSignal.timeout(4000)]),
      );
      signal.throwIfAborted();
      if (!isRecord(result) || typeof result.state !== 'string') throw denied();
      return { ...result, state: result.state };
    } catch {
      ownedDiagnostic('admission_sql_failed');
      throw denied();
    }
  }
  const identity = (subject: string) => {
    if (!/^user_[A-Za-z0-9]{1,80}$/.test(subject)) throw denied();
  };
  return Object.freeze({
    // Persist this pseudonymous key in encrypted server continuation state; do
    // not derive code-attempt identity from a replaceable browser cookie instead.
    identityKey(email: string) {
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw denied();
      return hmac('identity', email.toLowerCase());
    },
    async admit(action: Action, identityKey: string, trustedClientIp: string, signal: AbortSignal) {
      if (
        !['signin', 'register', 'verify', 'mfa', 'recover', 'reset'].includes(action) ||
        !digest(identityKey) ||
        !isIP(trustedClientIp)
      ) {
        ownedDiagnostic('admission_input_denied');
        throw denied();
      }
      const ticket = randomBytes(32).toString('hex');
      const network =
        isIP(trustedClientIp) === 6
          ? new URL(`https://[${trustedClientIp}]/`).hostname
          : trustedClientIp;
      const result = await run(
        policy.acceptanceOnly === true
          ? 'select business_session_private.admit_owned_acceptance_v1($1,$2,$3,$4,$5) as result'
          : 'select business_session_private.admit_owned_auth_v1($1,$2,$3,$4,$5) as result',
        [scope, action, ticket, identityKey, hmac('network', network.toLowerCase())],
        signal,
      );
      if (result.state !== 'allowed' || result.ticket !== ticket) {
        ownedDiagnostic('admission_denied');
        throw denied();
      }
      return ticket; // server-only; only a signin/register ticket can install a session
    },
    async install(
      ticket: string,
      key: string,
      envelope: string,
      expires: number,
      actor: BusinessActor,
      signal: AbortSignal,
    ) {
      identity(actor.subject);
      const ttl = Math.ceil(expires - now());
      if (
        !isVerifiedBusinessActor(actor) ||
        !digest(ticket) ||
        !digest(key) ||
        actor.realm !== 'business' ||
        actor.issuer !== issuer ||
        actor.audience !== policy.clientId ||
        !/^session_[A-Za-z0-9]{1,80}$/.test(actor.sessionId) ||
        actor.expiresAtSeconds <= now() / 1000 ||
        !Number.isSafeInteger(ttl) ||
        ttl < 1 ||
        ttl > 28800000 ||
        !/^[A-Za-z0-9_-]{40,50000}$/.test(envelope)
      )
        throw denied();
      const result = await run(
        'select business_session_private.put_owned_session_v1($1,$2,$3,$4,$5::integer,$6,$7,$8,$9) as result',
        [
          scope,
          ticket,
          key,
          envelope,
          ttl,
          issuer,
          policy.clientId,
          actor.subject,
          actor.sessionId,
        ],
        signal,
      );
      if (result.state !== 'ok') throw denied();
    },
    async beginReset(operationHash: string, verifiedSubject: string, signal: AbortSignal) {
      identity(verifiedSubject);
      if (!digest(operationHash)) throw denied();
      const result = await run(
        'select business_session_private.begin_owned_reset_v1($1,$2,$3,$4,$5) as result',
        [scope, operationHash, issuer, policy.clientId, verifiedSubject],
        signal,
      );
      if (!['started', 'pending', 'complete'].includes(result.state)) throw denied();
      // Only started permits a provider write. Pending requires reconciliation,
      // not a repeat of a potentially successful password reset.
      return result.state as 'started' | 'pending' | 'complete';
    },
    async completeReset(operationHash: string, verifiedSubject: string, signal: AbortSignal) {
      identity(verifiedSubject);
      if (!digest(operationHash)) throw denied();
      const result = await run(
        'select business_session_private.complete_owned_reset_v1($1,$2,$3,$4,$5) as result',
        [scope, operationHash, issuer, policy.clientId, verifiedSubject],
        signal,
      );
      if (result.state !== 'complete') throw denied();
    },
  });
}
