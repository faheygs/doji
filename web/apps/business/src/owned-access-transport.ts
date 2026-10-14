import type { AccessAction, AccessStep, AccessTransport } from './owned-access-contracts.ts';
import {
  BusinessPasswordRejected,
  isBusinessPasswordIssue,
} from '../../../../infra/portal-identity/business-password-policy.mts';

export interface OwnedAccessTransportConfig {
  enabled: boolean;
  origin: string;
  termsVersion: string;
  privacyVersion: string;
}
interface Dependencies {
  request: typeof fetch;
  currentOrigin: string;
  proof: (action: AccessAction, signal: AbortSignal) => Promise<string>;
  resetLink?: { available(): boolean; take(): string };
}
const unavailable = () =>
  Error('Business access could not be completed. Please return to sign in and try again.');
const transitions: Partial<Record<AccessAction, readonly AccessStep[]>> = {
  signin: ['verify', 'mfa', 'complete'],
  register: ['verify', 'mfa', 'complete'],
  verify: ['verify', 'mfa', 'complete'],
  mfa: ['verify', 'mfa', 'complete'],
  recover: ['check-email'],
  reset: ['reset-done', 'reset-pending'],
};
// Explicitly constructed only by a reviewed owned-auth composition. Not mounted in App.
// Credentials, CSRF and provider state are never written to browser storage.
export function createOwnedAccessTransport(config: OwnedAccessTransportConfig, deps: Dependencies) {
  const policy = Object.freeze({ ...config });
  const request = deps.request;
  if (
    policy.enabled !== true ||
    policy.origin !== 'https://business.dojipro.com' ||
    deps.currentOrigin !== policy.origin ||
    !policy.termsVersion ||
    !policy.privacyVersion
  )
    throw unavailable();
  let disposed = false,
    busy = false,
    csrf = '';
  const lifetime = new AbortController();
  async function call(
    action: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    signal.throwIfAborted();
    const response = await request(policy.origin + '/auth/owned/' + action, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal,
      headers:
        body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Doji-CSRF': csrf },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (
      (!response.ok && !(action === 'register' && response.status === 422)) ||
      response.redirected ||
      response.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      throw unavailable();
    const reader = response.body?.getReader();
    if (!reader) throw unavailable();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        length += value.length;
        if (length > 1024) throw unavailable();
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
      if (!response.ok) {
        if (
          Object.keys(value).length === 2 &&
          'field' in value &&
          value.field === 'password' &&
          'code' in value &&
          isBusinessPasswordIssue(value.code)
        )
          throw new BusinessPasswordRejected(value.code);
        throw unavailable();
      }
      return value as Record<string, unknown>;
    } finally {
      signal.removeEventListener('abort', cancel);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  const transport: AccessTransport = async (action, fields, callerSignal) => {
    if (disposed || busy || !Object.hasOwn(transitions, action)) throw unavailable();
    if (action === 'reset' && !deps.resetLink?.available()) throw unavailable();
    busy = true;
    let resetDispatched = false;
    const signal = AbortSignal.any([callerSignal, lifetime.signal, AbortSignal.timeout(15000)]);
    try {
      signal.throwIfAborted();
      if (!csrf) {
        const value = await call('bootstrap', undefined, signal);
        if (
          Object.keys(value).length !== 1 ||
          typeof value.csrf !== 'string' ||
          !/^[a-f0-9]{64}$/.test(value.csrf)
        )
          throw unavailable();
        csrf = value.csrf;
      }
      const proof = await deps.proof(action, signal);
      if (!proof || proof.length > 2048) throw unavailable();
      const body: Record<string, unknown> = { proof };
      if (action === 'signin' || action === 'register' || action === 'recover')
        body.email = fields.email;
      if (action === 'signin' || action === 'register') body.password = fields.password;
      if (action === 'reset') {
        signal.throwIfAborted();
        body.token = deps.resetLink?.take();
        if (typeof body.token !== 'string' || !/^[\x21-\x7e]{20,8192}$/.test(body.token))
          throw unavailable();
        body.password = fields.password;
      }
      if (action === 'verify' || action === 'mfa') body.code = fields.code;
      if (action === 'register')
        Object.assign(body, {
          termsAccepted: fields.termsAccepted === true,
          privacyAcknowledged: fields.privacyAcknowledged === true,
          country: 'US',
          termsVersion: policy.termsVersion,
          privacyVersion: policy.privacyVersion,
        });
      let value: Record<string, unknown>;
      try {
        resetDispatched = action === 'reset';
        value = await call(action, body, signal);
      } finally {
        delete body.password;
        delete body.code;
        delete body.token;
      }
      const rejected =
        value.codeRejected === true &&
        (action === 'verify' || action === 'mfa') &&
        value.step === action;
      if (
        Object.keys(value).length !== (rejected ? 2 : 1) ||
        (Object.hasOwn(value, 'codeRejected') && !rejected) ||
        typeof value.step !== 'string' ||
        !transitions[action]?.includes(value.step as AccessStep)
      )
        throw unavailable();
      signal.throwIfAborted();
      if (value.step === 'complete') csrf = '';
      return {
        step: value.step as AccessStep,
        ...(rejected ? { codeRejected: true as const } : {}),
      };
    } catch (error) {
      csrf = '';
      if (resetDispatched) return { step: 'reset-pending' };
      if (action === 'register' && error instanceof BusinessPasswordRejected) throw error;
      throw unavailable();
    } finally {
      busy = false;
    }
  };
  return {
    transport,
    dispose() {
      disposed = true;
      csrf = '';
      lifetime.abort();
    },
  };
}
