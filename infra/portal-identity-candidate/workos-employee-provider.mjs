// Server-only candidate; NOT a hosted endpoint. The HTTP controller must bind
// these sealed records to a browser flow, serialize consumption durably, enforce
// admission/CSRF, and authorize the mapped employee before installing a session.
// Passwords/codes are forwarded once, never persisted. No signup, SMS or SSO path.
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { boundedBody } from './bounded-body.mjs';
import { Buffer } from 'node:buffer';
import { createPortalIdentityVerifier } from './verify.mjs';
import { createWorkosSessionReader } from './workos-session.mjs';
const denied = () => Error('Employee authentication could not be verified');
const id = (v, prefix) =>
  typeof v === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{1,80}$`).test(v);
const token = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 8192 && !/[\x00-\x20\x7f]/.test(v);

export function createWorkosEmployeeProvider(config, request = fetch) {
  const policy = structuredClone(config);
  if (
    policy.realm !== 'employee' ||
    !id(policy.clientId, 'client') ||
    !/^sk_[A-Za-z0-9_-]{20,}$/.test(policy.apiKey || '') ||
    !/^[a-f0-9]{64}$/.test(policy.encryptionKey || '') ||
    !Number.isSafeInteger(policy.maxMfaAgeSeconds) ||
    policy.maxMfaAgeSeconds < 60 ||
    policy.maxMfaAgeSeconds > 28800
  )
    throw denied();
  const issuer = `https://api.workos.com/user_management/${policy.clientId}`;
  const verifierConfig = { ...policy, issuer, audience: policy.clientId };
  // Validate origin/key/token policy at construction, not after issuing a grant.
  createPortalIdentityVerifier(verifierConfig, async () => null);
  const key = Buffer.from(policy.encryptionKey, 'hex');
  const aad = (purpose) =>
    Buffer.from(`doji-employee-v1|${policy.origin}|${policy.clientId}|${purpose}`);
  function seal(value, purpose) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(purpose));
    return Buffer.concat([
      iv,
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64url');
  }
  function open(value, purpose) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,30000}$/.test(value)) throw denied();
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(aad(purpose));
    decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8'),
    );
  }
  async function bounded(signal, action) {
    if (policy.enabled !== true || !signal || signal.aborted) throw denied();
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    let abort;
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          deadline.throwIfAborted();
          return action(deadline);
        }),
        new Promise((_, reject) => {
          abort = () => reject(denied());
          deadline.addEventListener('abort', abort, { once: true });
          if (deadline.aborted) abort();
        }),
      ]);
    } catch {
      throw denied();
    } finally {
      if (abort) deadline.removeEventListener('abort', abort);
    }
  }
  async function post(path, body, signal) {
    const response = await request('https://api.workos.com' + path, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { Authorization: `Bearer ${policy.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    signal.throwIfAborted();
    if (response.status === 204 && path === '/user_management/sessions/revoke')
      return { status: 204, data: {} };
    if (!response.body) throw denied();
    const bytes = await boundedBody(response.body, signal, 65536);
    return { status: response.status, data: JSON.parse(new TextDecoder().decode(bytes)) };
  }
  const auth = (fields, signal) =>
    post(
      '/user_management/authenticate',
      {
        client_id: policy.clientId,
        client_secret: policy.apiKey,
        ...fields,
      },
      signal,
    );
  function pending(value, phase) {
    const p = open(value, 'pending');
    if (
      p.phase !== phase ||
      !id(p.subject, 'user') ||
      !token(p.pendingToken) ||
      !Number.isSafeInteger(p.expiresAtMs) ||
      p.expiresAtMs <= Date.now() ||
      p.expiresAtMs > Date.now() + 300000
    )
      throw denied();
    return p;
  }
  function tokens(response, subject) {
    const data = response.data;
    if (
      response.status !== 200 ||
      data.impersonator ||
      data.user?.email_verified !== true ||
      data.user?.id !== subject ||
      !token(data.access_token) ||
      !token(data.refresh_token)
    )
      throw denied();
    return { subject, accessToken: data.access_token, refreshToken: data.refresh_token };
  }
  function readReceipt(sealed, identity) {
    const proof = open(sealed, 'mfa');
    if (
      Object.entries(identity).some(([k, v]) => proof[k] !== v) ||
      proof.method !== 'workos-totp-grant' ||
      proof.revoked === true ||
      !Number.isSafeInteger(proof.verifiedAtMs) ||
      proof.verifiedAtMs > Date.now() ||
      !Number.isSafeInteger(proof.expiresAtSeconds) ||
      proof.expiresAtSeconds <= Date.now() / 1000 ||
      proof.expiresAtSeconds > Math.floor(proof.verifiedAtMs / 1000) + policy.maxMfaAgeSeconds
    )
      throw denied();
    return proof;
  }
  async function verifyTokens(grant, readProof, signal) {
    const verify = createPortalIdentityVerifier(
      verifierConfig,
      createWorkosSessionReader(policy, readProof, request),
    );
    const identity = await verify(
      new Request(policy.origin + '/auth/verify', {
        headers: { origin: policy.origin, authorization: `Bearer ${grant.accessToken}` },
        signal,
      }),
    );
    if (identity.subject !== grant.subject) throw denied();
    return identity;
  }
  return Object.freeze({
    begin(email, password, signal) {
      return bounded(signal, async (deadline) => {
        if (
          typeof email !== 'string' ||
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          typeof password !== 'string' ||
          !password.length ||
          password.length > 1024
        )
          throw denied();
        const { status, data } = await auth({ grant_type: 'password', email, password }, deadline);
        // Password-only success is configuration drift, NEVER employee MFA proof.
        if (
          ![400, 403].includes(status) ||
          !['mfa_enrollment', 'mfa_challenge'].includes(data.code) ||
          data.access_token ||
          data.refresh_token ||
          data.impersonator ||
          !id(data.user?.id, 'user') ||
          data.user?.email_verified !== true ||
          !token(data.pending_authentication_token)
        )
          throw denied();
        const factors = data.code === 'mfa_challenge' ? data.authentication_factors : [];
        if (
          !Array.isArray(factors) ||
          factors.length > 10 ||
          factors.some((f) => f.type !== 'totp' || !id(f.id, 'auth_factor')) ||
          new Set(factors.map((f) => f.id)).size !== factors.length ||
          (data.code === 'mfa_challenge' && factors.length === 0)
        )
          throw denied();
        return {
          pending: seal(
            {
              phase: 'prepare',
              subject: data.user.id,
              pendingToken: data.pending_authentication_token,
              enroll: data.code === 'mfa_enrollment',
              factors: factors.map((f) => f.id),
              expiresAtMs: Date.now() + 300000,
            },
            'pending',
          ),
          enrollmentRequired: data.code === 'mfa_enrollment',
        };
      });
    },
    prepare(sealedPending, signal) {
      return bounded(signal, async (deadline) => {
        const p = pending(sealedPending, 'prepare');
        let factorId, challenge, enrollmentSecret, enrollmentQr;
        if (p.enroll === true) {
          const response = await post(
            `/user_management/users/${p.subject}/auth_factors`,
            {
              type: 'totp',
              totp_issuer: 'Doji Employees',
              totp_user: p.subject,
            },
            deadline,
          );
          const factor = response.data.authentication_factor;
          challenge = response.data.authentication_challenge;
          enrollmentSecret = factor?.totp?.secret;
          enrollmentQr = factor?.totp?.qr_code;
          if (enrollmentQr !== undefined && (typeof enrollmentQr !== 'string'
            || enrollmentQr.length > 32768 || !/^data:image\/png;base64,iVBOR[A-Za-z0-9+/=]+$/.test(enrollmentQr))) throw denied();
          factorId = factor?.id;
          if (
            ![200, 201].includes(response.status) ||
            factor?.type !== 'totp' ||
            typeof enrollmentSecret !== 'string' ||
            !/^[A-Z2-7]{16,128}$/.test(enrollmentSecret)
          )
            throw denied();
        } else {
          factorId = p.factors?.[0];
          if (!id(factorId, 'auth_factor')) throw denied();
          const response = await post(`/auth/factors/${factorId}/challenge`, {}, deadline);
          if (![200, 201].includes(response.status)) throw denied();
          challenge = response.data;
        }
        const expiresAtMs = Math.min(p.expiresAtMs, Date.parse(challenge?.expires_at));
        if (
          !id(factorId, 'auth_factor') ||
          !id(challenge?.id, 'auth_challenge') ||
          challenge.authentication_factor_id !== factorId ||
          !Number.isSafeInteger(expiresAtMs) ||
          expiresAtMs <= Date.now()
        )
          throw denied();
        return {
          pending: seal(
            {
              phase: 'complete',
              subject: p.subject,
              pendingToken: p.pendingToken,
              challengeId: challenge.id,
              expiresAtMs,
            },
            'pending',
          ),
          // Only the bound enrollment UI may receive this; never log/cache it.
          ...(enrollmentSecret ? { enrollmentSecret } : {}),
          ...(enrollmentQr ? { enrollmentQr } : {}),
        };
      });
    },
    complete(sealedPending, code, signal) {
      return bounded(signal, async (deadline) => {
        const p = pending(sealedPending, 'complete');
        if (
          !id(p.challengeId, 'auth_challenge') ||
          typeof code !== 'string' ||
          !/^\d{6}$/.test(code)
        )
          throw denied();
        const grant = tokens(
          await auth(
            {
              grant_type: 'urn:workos:oauth:grant-type:mfa-totp',
              pending_authentication_token: p.pendingToken,
              authentication_challenge_id: p.challengeId,
              code,
            },
            deadline,
          ),
          p.subject,
        );
        const verifiedAtMs = Date.now();
        let proof;
        const identity = await verifyTokens(
          grant,
          async (expected) => {
            // This callback runs ONLY after cryptographic JWT verification and ONLY
            // in the successful TOTP-grant path. Enrollment/refresh cannot mint proof.
            if (expected.subject !== p.subject) throw denied();
            proof = {
              ...expected,
              method: 'workos-totp-grant',
              verifiedAtMs,
              expiresAtSeconds: Math.floor(verifiedAtMs / 1000) + policy.maxMfaAgeSeconds,
            };
            return proof;
          },
          deadline,
        );
        return { ...grant, identity, mfaReceipt: seal(proof, 'mfa') };
      });
    },
    refresh(session, signal) {
      return bounded(signal, async (deadline) => {
        if (
          !id(session?.subject, 'user') ||
          !id(session?.sessionId, 'session') ||
          !token(session?.refreshToken)
        )
          throw denied();
        const expected = {
          realm: 'employee',
          issuer,
          audience: policy.clientId,
          subject: session.subject,
          sessionId: session.sessionId,
        };
        readReceipt(session.mfaReceipt, expected); // Reject invalid/expired proof BEFORE token rotation.
        const grant = tokens(
          await auth(
            { grant_type: 'refresh_token', refresh_token: session.refreshToken },
            deadline,
          ),
          session.subject,
        );
        const identity = await verifyTokens(
          grant,
          async (actual) => readReceipt(session.mfaReceipt, actual),
          deadline,
        );
        if (identity.sessionId !== expected.sessionId) throw denied();
        return { ...grant, identity, mfaReceipt: session.mfaReceipt }; // Never renew MFA age on refresh.
      });
    },
    verify(accessToken, mfaReceipt, subject, signal) {
      return bounded(signal, (deadline) =>
        verifyTokens(
          { accessToken, subject },
          async (expected) => readReceipt(mfaReceipt, expected),
          deadline,
        ),
      );
    },
    revoke(sessionId, signal) {
      return bounded(signal, async (deadline) => {
        if (!id(sessionId, 'session')) throw denied();
        const result = await post(
          '/user_management/sessions/revoke',
          { session_id: sessionId },
          deadline,
        );
        if (![200, 204].includes(result.status)) throw denied();
      });
    },
  });
}
