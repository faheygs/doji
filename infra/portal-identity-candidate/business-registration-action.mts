// Candidate only. Dedicated WorkOS BUSINESS environment Actions secret, never
// reused for employee or production environments. Configure provider errors=DENY.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { boundedBody } from './bounded-body.mts';
import { isRecord } from './business-contracts.mts';
interface RegistrationConfig {
  enabled: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
  actionSecret: string;
}
type RegistrationExecute = (
  role: 'doji_business_registration',
  sql: string,
  parameters: string[],
  signal: AbortSignal,
) => Promise<unknown>;
export function createBusinessRegistrationAction(
  config: RegistrationConfig,
  execute: RegistrationExecute,
  now = Date.now,
) {
  const cfg = Object.freeze({ ...config });
  if (
    cfg.realm !== 'business' ||
    !/^client_[A-Za-z0-9]+$/.test(cfg.clientId || '') ||
    new URL(cfg.origin).origin !== cfg.origin ||
    !cfg.origin.startsWith('https://') ||
    typeof cfg.actionSecret !== 'string' ||
    // Accept the owner-approved provider-issued 25-character secret. The
    // signature, freshness and default-deny checks below remain mandatory.
    cfg.actionSecret.length < 25 ||
    cfg.actionSecret.length > 256 ||
    typeof execute !== 'function'
  )
    throw Error('Invalid registration configuration');
  const scope = createHash('sha256').update(`${cfg.origin}|${cfg.clientId}`).digest('hex');
  const hmac = (value: string) =>
    createHmac('sha256', cfg.actionSecret).update(value).digest('hex');
  const reply = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  return async (request: Request): Promise<Response> => {
    if (cfg.enabled !== true) return reply({ error: 'Unavailable' }, 503);
    const url = new URL(request.url);
    if (
      url.origin !== cfg.origin ||
      url.pathname !== '/auth/workos-registration' ||
      url.search ||
      request.method !== 'POST'
    )
      return reply({ error: 'Unavailable' }, 404);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(3000)]);
    let action: unknown, raw: string, actionId: string;
    try {
      if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
        throw Error();
      const header = request.headers.get('workos-signature') || '';
      const fields = /^t=(\d{13}),\s*v1=([a-f0-9]{64})$/.exec(header);
      if (!fields || !fields[1] || !fields[2] || Math.abs(now() - Number(fields[1])) > 30000)
        throw Error();
      raw = new TextDecoder('utf-8', { fatal: true }).decode(
        await boundedBody(request.body, signal, 16384),
      );
      if (
        !timingSafeEqual(
          Buffer.from(fields[2], 'hex'),
          Buffer.from(hmac(`${fields[1]}.${raw}`), 'hex'),
        )
      )
        throw Error();
      action = JSON.parse(raw);
      if (
        !isRecord(action) ||
        action.object !== 'user_registration_action_context' ||
        typeof action.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(action.id) ||
        !isRecord(action.user_data) ||
        action.user_data.object !== 'user_data' ||
        typeof action.user_data.email !== 'string' ||
        action.user_data.email.length > 320 ||
        !/^[^\s@]+@[^\s@]+$/.test(action.user_data.email)
      )
        throw Error();
      actionId = action.id;
    } catch {
      return reply({ error: 'Invalid registration request' }, 401);
    }
    let allowed = false;
    try {
      signal.throwIfAborted();
      allowed =
        (await execute(
          'doji_business_registration',
          'select business_session_private.reserve_registration($1,$2,$3) as result',
          [
            scope,
            createHash('sha256').update(actionId).digest('hex'),
            hmac('registration-payload|' + raw),
          ],
          signal,
        )) === true;
      signal.throwIfAborted();
    } catch {
      allowed = false;
    }
    const payload = {
      timestamp: now(),
      verdict: allowed ? 'Allow' : 'Deny',
      ...(!allowed
        ? {
            error_message:
              'Business registration is currently unavailable. Please try again later.',
          }
        : {}),
    };
    return reply(
      {
        object: 'user_registration_action_response',
        payload,
        signature: hmac(`${payload.timestamp}.${JSON.stringify(payload)}`),
      },
      200,
    );
  };
}
