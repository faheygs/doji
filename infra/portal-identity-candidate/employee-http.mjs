// Portal-only controller. Provider grants never reach the browser. The injected
// application adapter must resolve an explicitly bound employee and reauthorize
// every command atomically. This module does not authorize by email/provider role.
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
import { boundedBody } from './bounded-body.mjs';
import { Buffer } from 'node:buffer';

const random = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const opaque = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
const fail = (status = 401) => Object.assign(Error('Employee access unavailable'), { status });
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sessionCookie = '__Host-doji_employee';
const flowCookie = '__Host-doji_employee_login';
const cookieHeader = (name, value, seconds) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
function cookie(request, name) {
  const entries = (request.headers.get('cookie') || '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + '='));
  if (entries.length !== 1) return null;
  const value = entries[0].slice(name.length + 1);
  return opaque(value) ? value : null;
}
function json(value, status = 200, cookies = []) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(value), { status, headers });
}

export function createEmployeeHttp(
  config,
  { store, provider, application, admission, now = Date.now },
) {
  const policy = structuredClone(config);
  if (
    policy.realm !== 'employee' ||
    new URL(policy.origin).origin !== policy.origin ||
    !policy.origin.startsWith('https://') ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId || '') ||
    !/^[a-f0-9]{64}$/.test(policy.encryptionKey || '') ||
    !store ||
    !provider ||
    typeof application?.authorize !== 'function' ||
    typeof application?.command !== 'function' ||
    typeof admission !== 'function'
  )
    throw fail(503);
  const key = Buffer.from(policy.encryptionKey, 'hex');
  const aad = (purpose) =>
    Buffer.from(`doji-employee-http-v1|${policy.origin}|${policy.clientId}|${purpose}`);
  function seal(value, purpose) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(purpose));
    return Buffer.concat([
      iv,
      cipher.update(JSON.stringify(value)),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64url');
  }
  function open(value, purpose) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,50000}$/.test(value)) throw fail();
    const bytes = Buffer.from(value, 'base64url'),
      decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(aad(purpose));
    decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8'),
    );
  }
  function actor(identity, previous) {
    if (
      identity?.realm !== 'employee' ||
      identity.audience !== policy.clientId ||
      identity.issuer !== `https://api.workos.com/user_management/${policy.clientId}` ||
      !/^user_[A-Za-z0-9]+$/.test(identity.subject || '') ||
      !/^session_[A-Za-z0-9]+$/.test(identity.sessionId || '') ||
      identity.mfaVerified !== true ||
      !Number.isSafeInteger(identity.expiresAtSeconds) ||
      identity.expiresAtSeconds <= now() / 1000 ||
      (previous &&
        (identity.subject !== previous.subject || identity.sessionId !== previous.sessionId))
    )
      throw fail();
    return identity;
  }
  async function body(request, fields) {
    if (request.headers.get('content-type') !== 'application/json' || !request.body)
      throw fail(400);
    let value;
    try {
      value = JSON.parse(
        new TextDecoder().decode(await boundedBody(request.body, request.signal, 16384)),
      );
    } catch (error) {
      if (error.status === 413) throw error;
      throw fail(400);
    }
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((k) => !fields.includes(k))
    )
      throw fail(400);
    return value;
  }
  const revoke = (id) => provider.revoke(id, AbortSignal.timeout(5000)).catch(() => {});
  return async function handle(incoming) {
    const request = new Request(incoming, {
      signal: AbortSignal.any([incoming.signal, AbortSignal.timeout(15000)]),
    });
    const url = new URL(request.url),
      path = url.pathname;
    try {
      if (policy.enabled !== true) throw fail(503);
      request.signal.throwIfAborted();
      if (url.origin !== policy.origin || url.search) throw fail(403);
      const sameOriginRead =
        request.method === 'GET' &&
        !request.headers.has('origin') &&
        request.headers.get('sec-fetch-site') === 'same-origin';
      if (
        (!sameOriginRead && request.headers.get('origin') !== policy.origin) ||
        ![null, 'same-origin'].includes(request.headers.get('sec-fetch-site'))
      )
        throw fail(403);
      if (path === '/auth/start' && request.method === 'POST') {
        const existing = cookie(request, sessionCookie);
        if (existing)
          await store.withSession(
            hash(existing),
            async (cell) => {
              if (cell.value) throw fail(409);
            },
            request.signal,
          );
        const input = await body(request, ['email', 'password', 'proof']);
        // Durable admission/CAPTCHA is required, never a browser-only throttle.
        if ((await admission({ email: input.email, proof: input.proof, signal: request.signal })) !== true)
          throw fail(429);
        request.signal.throwIfAborted();
        const begun = await provider.begin(input.email, input.password, request.signal);
        const prepared = await provider.prepare(begun.pending, request.signal);
        request.signal.throwIfAborted();
        const binding = random(),
          csrf = random(),
          expires = now() + 300000;
        await store.putFlow(
          hash(binding),
          seal({ pending: prepared.pending, csrf, expires }, 'flow'),
          expires,
          request.signal,
        );
        return json(
          {
            step: 'totp',
            csrf,
            enrollmentRequired: begun.enrollmentRequired === true,
            ...(prepared.enrollmentSecret ? { enrollmentSecret: prepared.enrollmentSecret } : {}),
            ...(prepared.enrollmentQr ? { enrollmentQr: prepared.enrollmentQr } : {}),
          },
          200,
          [cookieHeader(flowCookie, binding, 300)],
        );
      }
      if (path === '/auth/complete' && request.method === 'POST') {
        const input = await body(request, ['code']);
        if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw fail(400);
        const binding = cookie(request, flowCookie),
          csrf = request.headers.get('x-doji-csrf');
        if (!binding || !opaque(csrf)) throw fail(403);
        const envelope = await store.consumeFlow(
          hash(binding),
          (value) => {
            const flow = open(value, 'flow');
            return flow.expires > now() && equal(flow.csrf, csrf);
          },
          request.signal,
        );
        if (!envelope) throw fail();
        // One durable winner may exchange this challenge. A failed OTP requires
        // a new password login; no uncertain grant or challenge is replayed.
        const grant = await provider.complete(
          open(envelope, 'flow').pending,
          input.code,
          request.signal,
        );
        const identity = actor(grant.identity);
        let installed = false;
        try {
          if (grant.subject !== identity.subject) throw fail();
          const operator = await application.authorize(identity, request.signal);
          request.signal.throwIfAborted();
          const handle = random(),
            csrf = random(),
            created = now();
          await store.putSession(
            hash(handle),
            seal({ grant, actor: identity, csrf, created, touched: created }, 'session'),
            created + 8 * 3600000,
            request.signal,
          );
          installed = true;
          return json({ signedIn: true, csrf, assurance: 'aal2', operator }, 200, [
            cookieHeader(sessionCookie, handle, 28800),
            cookieHeader(flowCookie, '', 0),
          ]);
        } finally {
          if (!installed) await revoke(identity.sessionId);
        }
      }
      if (
        !(
          (path === '/api/session' && request.method === 'GET') ||
          (['/api/rpc', '/auth/logout'].includes(path) && request.method === 'POST')
        )
      )
        throw fail(404);
      const handle = cookie(request, sessionCookie);
      if (!handle) throw fail();
      const input =
        request.method === 'POST'
          ? await body(request, path === '/api/rpc' ? ['name', 'args'] : [])
          : null;
      return await store.withSession(
        hash(handle),
        async (cell) => {
          if (!cell.value) throw fail();
          let saved;
          try {
            saved = open(cell.value, 'session');
          } catch {
            await cell.remove();
            throw fail();
          }
          if (saved.created + 8 * 3600000 <= now() || saved.touched + 30 * 60000 <= now()) {
            await cell.remove();
            await revoke(saved.actor.sessionId);
            throw fail();
          }
          if (request.method === 'POST' && !equal(saved.csrf, request.headers.get('x-doji-csrf')))
            throw fail(403);
          if (path === '/auth/logout') {
            await cell.remove();
            let remoteConfirmed = true;
            try {
              await provider.revoke(saved.actor.sessionId, request.signal);
            } catch {
              remoteConfirmed = false;
            }
            return json({ signedIn: false, remoteConfirmed }, 200, [
              cookieHeader(sessionCookie, '', 0),
            ]);
          }
          let operator;
          try {
            if (saved.actor.expiresAtSeconds <= now() / 1000 + 30) {
              const next = await provider.refresh(
                { ...saved.grant, sessionId: saved.actor.sessionId },
                request.signal,
              );
              saved.actor = actor(next.identity, saved.actor);
              if (next.subject !== saved.actor.subject) throw fail();
              saved.grant = next;
            } else
              saved.actor = actor(
                await provider.verify(
                  saved.grant.accessToken,
                  saved.grant.mfaReceipt,
                  saved.grant.subject,
                  request.signal,
                ),
                saved.actor,
              );
            operator = await application.authorize(saved.actor, request.signal);
          } catch {
            await cell.remove();
            await revoke(saved.actor.sessionId);
            throw fail();
          }
          saved.touched = now();
          request.signal.throwIfAborted();
          await cell.replace(seal(saved, 'session'));
          if (path === '/api/session')
            return json({ signedIn: true, csrf: saved.csrf, assurance: 'aal2', operator });
          // This adapter must accept only a fixed allowlist and perform its own
          // atomic authorization. A prior session read is not command authority.
          if (
            typeof input.name !== 'string' ||
            !/^[a-z][a-z0-9_]{1,100}$/.test(input.name) ||
            !input.args ||
            typeof input.args !== 'object' ||
            Array.isArray(input.args)
          )
            throw fail(400);
          return json(await application.command(saved.actor, input, request.signal));
        },
        request.signal,
      );
    } catch (error) {
      return json(
        { message: 'Employee access could not be completed. Please retry or sign in again.' },
        [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 503,
      );
    }
  };
}
