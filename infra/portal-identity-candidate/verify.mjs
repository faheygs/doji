// LOCAL CANDIDATE ONLY. Not imported by a Worker, Edge function or browser.
// No password handling, provider provisioning, JWT minting or member token exchange.
import { createLocalJWKSet, jwtVerify } from 'jose';

const denied = () => new Error('Portal identity could not be verified');
const bounded = (v, max) =>
  typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x20\x7f]/.test(v);
const https = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
};

/** Trusted SERVER configuration and pinned provider keys only, never request data.
 * checkSession must independently verify the exact session's current status,
 * confirmed email and MFA with this environment's provider credentials. It must
 * honor AbortSignal. workos-session.mjs supplies a bounded candidate reader;
 * durable server-owned MFA receipts and production billing remain release gates.
 */
export function createPortalIdentityVerifier(config, checkSession) {
  if (
    !config ||
    !['employee', 'business'].includes(config.realm) ||
    !https(config.issuer) ||
    !bounded(config.audience, 256) ||
    !https(config.origin) ||
    new URL(config.origin).origin !== config.origin ||
    !Number.isInteger(config.maxTokenAgeSeconds) ||
    config.maxTokenAgeSeconds < 60 ||
    config.maxTokenAgeSeconds > 3600 ||
    typeof checkSession !== 'function' ||
    !Array.isArray(config.jwks?.keys) ||
    config.jwks.keys.length < 1 ||
    config.jwks.keys.length > 5
  )
    throw denied();
  const policy = structuredClone(config); // Later mutation cannot weaken policy.
  const ids = new Set();
  for (const key of policy.jwks.keys) {
    if (
      !bounded(key.kid, 128) ||
      ids.has(key.kid) ||
      key.use !== 'sig' ||
      !['RS256', 'ES256'].includes(key.alg) ||
      (key.alg === 'RS256' ? key.kty !== 'RSA' : key.kty !== 'EC' || key.crv !== 'P-256') ||
      ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k', 'jku', 'x5u'].some((k) => k in key) ||
      (key.key_ops && (key.key_ops.length !== 1 || key.key_ops[0] !== 'verify'))
    )
      throw denied();
    ids.add(key.kid);
  }
  const keys = createLocalJWKSet(policy.jwks);
  return async function verify(request) {
    if (
      policy.enabled !== true ||
      request.signal.aborted ||
      request.headers.get('origin') !== policy.origin
    )
      throw denied();
    const header = request.headers.get('authorization') || '';
    if (
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header) ||
      header.length > 8192
    )
      throw denied();
    try {
      const { payload, protectedHeader } = await jwtVerify(header.slice(7), keys, {
        issuer: policy.issuer,
        audience: policy.audience,
        algorithms: ['RS256', 'ES256'],
        clockTolerance: 0,
        requiredClaims: ['iss', 'aud', 'sub', 'sid', 'iat', 'exp'],
        maxTokenAge: policy.maxTokenAgeSeconds,
      });
      const now = Math.floor(Date.now() / 1000);
      if (
        !ids.has(protectedHeader.kid) ||
        protectedHeader.jku ||
        protectedHeader.jwk ||
        protectedHeader.x5u ||
        !bounded(payload.sub, 256) ||
        !bounded(payload.sid, 256) ||
        payload.aud !== policy.audience ||
        !Number.isSafeInteger(payload.iat) ||
        !Number.isSafeInteger(payload.exp) ||
        payload.iat > now ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > policy.maxTokenAgeSeconds
      )
        throw denied();
      const expected = Object.freeze({
        realm: policy.realm,
        issuer: policy.issuer,
        audience: policy.audience,
        subject: payload.sub,
        sessionId: payload.sid,
      });
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
      const current = await new Promise((resolve, reject) => {
        const abort = () => reject(denied());
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) {
          abort();
          return;
        }
        Promise.resolve()
          .then(() => checkSession(expected, signal))
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort));
      });
      const checkedAt = Date.now();
      if (
        !current ||
        Object.entries(expected).some(([k, v]) => current[k] !== v) ||
        current.active !== true ||
        current.emailVerified !== true ||
        typeof current.mfaVerified !== 'boolean' ||
        (policy.realm === 'employee' && current.mfaVerified !== true) ||
        !Number.isSafeInteger(current.observedAtMs) ||
        current.observedAtMs > checkedAt ||
        checkedAt - current.observedAtMs > 5000 ||
        !Number.isSafeInteger(current.expiresAtSeconds) ||
        current.expiresAtSeconds <= checkedAt / 1000 ||
        payload.exp <= checkedAt / 1000 ||
        signal.aborted
      )
        throw denied();
      // Email/provider roles never authorize application access or choose an ID.
      return Object.freeze({
        ...expected,
        mfaVerified: current.mfaVerified,
        expiresAtSeconds: Math.min(payload.exp, current.expiresAtSeconds),
      });
    } catch {
      throw denied();
    }
  };
}
