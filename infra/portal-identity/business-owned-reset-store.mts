// LOCAL ONLY. No production SQL allowlist or runtime mounting.
import { createHash } from 'node:crypto';
import { createBusinessCipher } from './business-http-state.mts';
import { isRecord } from './business-contracts.mts';
import type { StoreExecute } from './business-session-store.mts';
import type { OwnedResetMapping } from './business-owned-reset.mts';
import type { OwnedResetMetadata } from './business-owned-provider.mts';
interface Policy {
  enabled: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
  encryptionKey: string;
}
const denied = () => Error('Business reset storage unavailable.');
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function createBusinessOwnedResetStore(
  config: Policy,
  execute: StoreExecute,
  now = Date.now,
) {
  const policy = Object.freeze({ ...config });
  if (
    policy.enabled !== true ||
    policy.realm !== 'business' ||
    policy.origin !== 'https://business.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId) ||
    !digest(policy.encryptionKey)
  )
    throw denied();
  const scope = createHash('sha256').update(`${policy.origin}|${policy.clientId}`).digest('hex');
  const issuer = `https://api.workos.com/user_management/${policy.clientId}`;
  const { seal, open } = createBusinessCipher<OwnedResetMapping & { purpose: 'owned-reset-link' }>(
    policy.origin,
    policy.clientId,
    policy.encryptionKey,
  );
  const subjectValid = (subject: string) => {
    if (!/^user_[A-Za-z0-9]{1,80}$/.test(subject)) throw denied();
  };
  async function run(sql: string, parameters: (string | number | null)[], signal: AbortSignal) {
    signal.throwIfAborted();
    try {
      const result = await execute(
        'doji_business_session',
        sql,
        parameters,
        AbortSignal.any([signal, AbortSignal.timeout(4000)]),
      );
      signal.throwIfAborted();
      if (!isRecord(result) || typeof result.state !== 'string') throw denied();
      return result;
    } catch {
      throw denied();
    }
  }
  return Object.freeze({
    async remember(metadata: OwnedResetMetadata, identityKey: string, signal: AbortSignal) {
      subjectValid(metadata.subject);
      if (
        !digest(metadata.tokenHash) ||
        !digest(identityKey) ||
        !/^password_reset_[A-Za-z0-9]{1,80}$/.test(metadata.resetId) ||
        !Number.isSafeInteger(metadata.expires) ||
        metadata.expires <= now() ||
        metadata.expires > now() + 86400000
      )
        throw denied();
      const mapping = {
        purpose: 'owned-reset-link' as const,
        realm: 'business' as const,
        origin: policy.origin,
        issuer,
        audience: policy.clientId,
        subject: metadata.subject,
        tokenHash: metadata.tokenHash,
        identityKey,
        resetId: metadata.resetId,
        expires: metadata.expires,
      };
      const result = await run(
        'select business_session_private.put_owned_reset_link_v1($1,$2,$3,$4,$5::bigint,$6,$7,$8) as result',
        [
          scope,
          metadata.tokenHash,
          metadata.resetId,
          seal(mapping),
          metadata.expires,
          issuer,
          policy.clientId,
          metadata.subject,
        ],
        signal,
      );
      if (result.state !== 'ok') throw denied();
    },
    async resolve(tokenHash: string, signal: AbortSignal): Promise<OwnedResetMapping | null> {
      if (!digest(tokenHash)) throw denied();
      const result = await run(
        'select business_session_private.get_owned_reset_link_v1($1,$2) as result',
        [scope, tokenHash],
        signal,
      );
      if (result.state === 'missing') return null;
      if (result.state !== 'ok' || typeof result.envelope !== 'string') throw denied();
      let value: unknown;
      try {
        value = open(result.envelope);
      } catch {
        throw denied();
      }
      if (
        !isRecord(value) ||
        value.purpose !== 'owned-reset-link' ||
        value.realm !== 'business' ||
        value.origin !== policy.origin ||
        value.issuer !== issuer ||
        value.audience !== policy.clientId ||
        value.tokenHash !== tokenHash ||
        !digest(value.identityKey) ||
        typeof value.subject !== 'string' ||
        typeof value.resetId !== 'string' ||
        !/^password_reset_[A-Za-z0-9]{1,80}$/.test(value.resetId) ||
        typeof value.expires !== 'number' ||
        !Number.isSafeInteger(value.expires) ||
        value.expires <= now()
      )
        throw denied();
      subjectValid(value.subject);
      return {
        realm: 'business',
        origin: policy.origin,
        issuer,
        audience: policy.clientId,
        subject: value.subject,
        tokenHash,
        identityKey: value.identityKey,
        resetId: value.resetId,
        expires: value.expires,
      };
    },
    async beginReset(operation: string, subject: string, signal: AbortSignal, tokenHash: string) {
      subjectValid(subject);
      if (!digest(operation) || !digest(tokenHash)) throw denied();
      const result = await run(
        'select business_session_private.begin_owned_reset_link_v1($1,$2,$3,$4,$5,$6) as result',
        [scope, tokenHash, operation, issuer, policy.clientId, subject],
        signal,
      );
      if (!['started', 'pending', 'complete'].includes(String(result.state))) throw denied();
      return result.state as 'started' | 'pending' | 'complete';
    },
    async completeReset(operation: string, subject: string, signal: AbortSignal) {
      subjectValid(subject);
      if (!digest(operation)) throw denied();
      const result = await run(
        'select business_session_private.complete_owned_reset_link_v1($1,$2,$3,$4,$5) as result',
        [scope, operation, issuer, policy.clientId, subject],
        signal,
      );
      if (result.state !== 'complete') throw denied();
    },
    async reconcile(eventId: string, resetId: string, subject: string, signal: AbortSignal) {
      subjectValid(subject);
      if (
        !/^event_[A-Za-z0-9]{1,80}$/.test(eventId) ||
        !/^password_reset_[A-Za-z0-9]{1,80}$/.test(resetId)
      )
        throw denied();
      const result = await run(
        'select business_session_private.reconcile_owned_reset_link_v1($1,$2,$3,$4,$5,$6) as result',
        [scope, eventId, resetId, issuer, policy.clientId, subject],
        signal,
      );
      if (!['complete', 'ignored'].includes(String(result.state))) throw denied();
    },
  });
}
