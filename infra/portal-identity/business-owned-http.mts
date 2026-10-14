// LOCAL ONLY. Default-off runtime/proxy composition; sending/deployment are gated.
import { boundedBody } from './bounded-body.mts';
import { ownedDiagnostic } from './business-owned-diagnostics.mts';
import { businessPasswordIssue, BusinessPasswordRejected } from './business-password-policy.mts';
import { isRecord, errorStatus } from './business-contracts.mts';
import { random, hash, equal, opaque, fail } from './business-http-state.mts';
import {
  createBusinessOwnedFlow,
  type OwnedFlowPolicy,
  type OwnedFlowDependencies,
} from './business-owned-flow.mts';
import type { createBusinessOwnedSessionInstaller } from './business-owned-session.mts';
import type { createBusinessSessionStore } from './business-session-store.mts';
import type { createBusinessOwnedReset } from './business-owned-reset.mts';

export interface OwnedHttpPolicy extends OwnedFlowPolicy {
  signupEnabled: boolean;
}
export interface OwnedHttpDependencies extends Omit<OwnedFlowDependencies, 'install' | 'store'> {
  store: ReturnType<typeof createBusinessSessionStore>;
  install: ReturnType<typeof createBusinessOwnedSessionInstaller>;
  // Explicit local composition only; omission keeps reset unavailable.
  reset?: ReturnType<typeof createBusinessOwnedReset>;
}
const bindingName = '__Host-doji_business_owned_binding';
const continuationName = '__Host-doji_business_owned_flow';
const sessionName = '__Host-doji_business';
const cookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
function readCookie(request: Request, name: string) {
  const values = (request.headers.get('cookie') || '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + '='));
  if (!values.length) return null;
  if (values.length !== 1) throw fail(403);
  const value = values[0]!.slice(name.length + 1);
  if (!opaque(value)) throw fail(403);
  return value;
}
function response(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(body), { status, headers });
}
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));
const validEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPassword = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256;

export function createBusinessOwnedHttp(config: OwnedHttpPolicy, deps: OwnedHttpDependencies) {
  const policy = Object.freeze({ ...config });
  if (policy.origin !== 'https://business.dojipro.com') throw fail(503);
  return async (request: Request) => {
    try {
      if (policy.enabled !== true || policy.sendingEnabled !== true) throw fail(503);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
      signal.throwIfAborted();
      const url = new URL(request.url);
      const sameOriginRead =
        request.method === 'GET' &&
        !request.headers.has('origin') &&
        request.headers.get('sec-fetch-site') === 'same-origin';
      if (
        url.origin !== policy.origin ||
        url.search ||
        url.hash ||
        (!sameOriginRead && request.headers.get('origin') !== policy.origin) ||
        ![null, 'same-origin'].includes(request.headers.get('sec-fetch-site'))
      )
        throw fail(403);
      const action = url.pathname.slice('/auth/owned/'.length);
      if (
        !url.pathname.startsWith('/auth/owned/') ||
        !(action === 'bootstrap'
          ? request.method === 'GET'
          : (['signin', 'register', 'verify', 'mfa', 'recover'].includes(action) ||
              (action === 'reset' && typeof deps.reset === 'function')) &&
            request.method === 'POST')
      )
        throw fail(404);
      // Never replace an existing signed-in account through an unauthenticated form.
      const existing = readCookie(request, sessionName);
      if (existing)
        await deps.store.withSession(
          hash(existing),
          async (cell) => {
            if (cell.value !== null) throw fail(409);
          },
          signal,
        );
      const binding = readCookie(request, bindingName);
      if (action === 'bootstrap') {
        const next = binding ?? random();
        return response({ csrf: hash(next) }, 200, [cookie(bindingName, next, 300)]);
      }
      if (!binding || !equal(request.headers.get('x-doji-csrf'), hash(binding))) throw fail(403);
      if (request.headers.get('content-type') !== 'application/json') throw fail(400);
      let input: unknown;
      try {
        input = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            await boundedBody(request.body, signal, action === 'reset' ? 16384 : 4096),
          ),
        );
      } catch (error) {
        throw fail(errorStatus(error) === 413 ? 413 : 400);
      }
      if (
        !isRecord(input) ||
        typeof input.proof !== 'string' ||
        input.proof.length < 1 ||
        input.proof.length > 2048
      )
        throw fail(400);
      let installed: string | null = null;
      const flow = createBusinessOwnedFlow(policy, {
        ...deps,
        install: async (tokens, agreement, ticket, abort) => {
          installed = await deps.install(tokens, agreement, ticket, abort);
        },
      });
      let result: { step: string; handle?: string; codeRejected?: true };
      if (action === 'signin' || action === 'register') {
        const signup = action === 'register';
        if (
          !keys(input, [
            'email',
            'password',
            'proof',
            ...(signup
              ? [
                  'termsAccepted',
                  'privacyAcknowledged',
                  'country',
                  'termsVersion',
                  'privacyVersion',
                ]
              : []),
          ]) ||
          !validEmail(input.email) ||
          typeof input.password !== 'string' ||
          (!signup && !validPassword(input.password))
        )
          throw fail(400);
        if (
          signup &&
          (policy.signupEnabled !== true ||
            input.termsAccepted !== true ||
            input.privacyAcknowledged !== true ||
            input.country !== 'US' ||
            input.termsVersion !== policy.termsVersion ||
            input.privacyVersion !== policy.privacyVersion)
        )
          throw fail(403);
        if (signup) {
          const issue = businessPasswordIssue(input.password, input.email);
          if (issue) throw new BusinessPasswordRejected(issue);
        }
        result = await flow.start(
          {
            signup,
            email: input.email,
            password: input.password,
            proof: input.proof,
            ...(signup
              ? {
                  agreement: {
                    termsAccepted: true,
                    privacyAcknowledged: true,
                    country: 'US',
                    termsVersion: policy.termsVersion,
                    privacyVersion: policy.privacyVersion,
                  },
                }
              : {}),
          },
          binding,
          signal,
        );
      } else if (action === 'verify' || action === 'mfa') {
        const handle = readCookie(request, continuationName);
        if (
          !keys(input, ['code', 'proof']) ||
          !handle ||
          typeof input.code !== 'string' ||
          !/^\d{6}$/.test(input.code)
        )
          throw fail(400);
        result = await flow.verify(handle, binding, input.code, input.proof, signal, action);
      } else if (action === 'reset') {
        if (
          !keys(input, ['token', 'password', 'proof']) ||
          typeof input.token !== 'string' ||
          !/^[\x21-\x7e]{20,8192}$/.test(input.token) ||
          !validPassword(input.password) ||
          !deps.reset
        )
          throw fail(400);
        try {
          result = await deps.reset(input.token, input.password, input.proof, signal);
        } finally {
          delete input.token;
          delete input.password;
        }
      } else {
        if (!keys(input, ['email', 'proof']) || !validEmail(input.email)) throw fail(400);
        result = await flow.recover(input.email, input.proof, signal);
      }
      signal.throwIfAborted();
      const cookies: string[] = [];
      if (result.step === 'reset-done' || result.step === 'reset-pending') {
        cookies.push(cookie(bindingName, '', 0), cookie(continuationName, '', 0));
      }
      if (result.step === 'complete') {
        if (!opaque(installed)) throw fail(503);
        cookies.push(
          cookie(sessionName, installed, 28800),
          cookie(bindingName, '', 0),
          cookie(continuationName, '', 0),
        );
      } else if (result.step === 'verify' || result.step === 'mfa') {
        if (!opaque(result.handle)) throw fail(503);
        cookies.push(cookie(continuationName, result.handle, 300));
      }
      return response(
        { step: result.step, ...(result.codeRejected ? { codeRejected: true } : {}) },
        200,
        cookies,
      );
    } catch (error) {
      if (error instanceof BusinessPasswordRejected)
        return response({ field: 'password', code: error.code }, 422);
      const status = errorStatus(error);
      if (!status || status === 503) ownedDiagnostic('http_unavailable');
      return response(
        {
          message:
            'Business access could not be completed. Please return to sign in and try again.',
        },
        status && [400, 401, 403, 404, 409, 413, 429].includes(status) ? status : 503,
      );
    }
  };
}
