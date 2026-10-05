// LOCAL CANDIDATE, no deployed import. Called only AFTER signature verification.
// WorkOS user/session metadata is not application authority or MFA evidence.
import { boundedBody } from './bounded-body.mts';
import { record, integer } from './portal-contracts.mts';
import type {
  PortalRealm,
  PortalIdentity,
  CheckPortalSession,
  PortalFetch,
} from './portal-contracts.mts';
const denied = () => new Error('Portal provider session could not be verified');
const id = (value: unknown, prefix: 'client' | 'user' | 'session'): value is string =>
  typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{1,80}$`).test(value);

interface SessionReaderConfig {
  enabled: boolean;
  realm: PortalRealm;
  clientId: string;
  apiKey: string;
}
export function createWorkosSessionReader(
  config: SessionReaderConfig,
  readMfaReceipt: CheckPortalSession,
  fetcher: PortalFetch = fetch,
) {
  if (
    !['business', 'employee'].includes(config?.realm) ||
    !id(config.clientId, 'client') ||
    !/^sk_[A-Za-z0-9_-]{20,}$/.test(config.apiKey || '') ||
    typeof readMfaReceipt !== 'function'
  )
    throw denied();
  const policy = Object.freeze({ ...config });
  const issuer = `https://api.workos.com/user_management/${policy.clientId}`;
  async function read(path: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetcher('https://api.workos.com' + path, {
      method: 'GET',
      redirect: 'error',
      signal,
      headers: { Authorization: `Bearer ${policy.apiKey}`, Accept: 'application/json' },
    });
    if (!response.ok || !response.body) throw denied();
    const bytes = await boundedBody(response.body, signal, 65536);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  return async (identity: PortalIdentity, callerSignal: AbortSignal) => {
    try {
      if (
        policy.enabled !== true ||
        callerSignal.aborted ||
        identity.realm !== policy.realm ||
        identity.issuer !== issuer ||
        identity.audience !== policy.clientId ||
        !id(identity.subject, 'user') ||
        !id(identity.sessionId, 'session')
      )
        throw denied();
      const expected = Object.freeze({
        realm: policy.realm,
        issuer,
        audience: policy.clientId,
        subject: identity.subject,
        sessionId: identity.sessionId,
      });
      const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(4000)]);
      const [user, listed, proof] = await Promise.all([
        read(`/user_management/users/${expected.subject}`, signal),
        read(`/user_management/users/${expected.subject}/sessions?limit=10`, signal),
        readMfaReceipt(expected, signal),
      ]);
      // A missing session on this single bounded page denies access; never scan all users/sessions.
      if (
        !record(user) ||
        user.id !== expected.subject ||
        user.email_verified !== true ||
        user.deleted_at ||
        !record(listed) ||
        !Array.isArray(listed.data) ||
        listed.data.length > 10
      )
        throw denied();
      const matches = listed.data.filter((s: unknown) => record(s) && s.id === expected.sessionId);
      const session = matches[0];
      if (!record(session) || typeof session.expires_at !== 'string') throw denied();
      const expiresAtSeconds = Math.floor(Date.parse(session.expires_at) / 1000);
      if (
        matches.length !== 1 ||
        session.user_id !== expected.subject ||
        session.status !== 'active' ||
        session.ended_at ||
        session.impersonator ||
        !Number.isSafeInteger(expiresAtSeconds) ||
        expiresAtSeconds <= Date.now() / 1000 ||
        signal.aborted
      )
        throw denied();
      // Receipt must come from our trusted server-observed successful TOTP grant,
      // bound to its verified resulting sid. Never use browser input or user metadata.
      const receiptExpiry =
        record(proof) && integer(proof.expiresAtSeconds) ? proof.expiresAtSeconds : 0;
      const mfaVerified =
        record(proof) &&
        Object.entries(expected).every(([k, v]) => proof[k] === v) &&
        proof.method === 'workos-totp-grant' &&
        proof.revoked !== true &&
        integer(proof.verifiedAtMs) &&
        proof.verifiedAtMs <= Date.now() &&
        integer(proof.expiresAtSeconds) &&
        proof.expiresAtSeconds > Date.now() / 1000;
      if (policy.realm === 'employee' && !mfaVerified) throw denied();
      return {
        ...expected,
        active: true,
        emailVerified: true,
        mfaVerified,
        observedAtMs: Date.now(),
        expiresAtSeconds: mfaVerified
          ? Math.min(expiresAtSeconds, receiptExpiry)
          : expiresAtSeconds,
      };
    } catch {
      throw denied();
    }
  };
}
