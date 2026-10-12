// LOCAL ONLY: not exposed by the live proxy/runtime, no webhook registration.
// Dedicated BUSINESS webhook secret; never reuse employee/registration secrets.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { boundedBody } from './bounded-body.mts';
import { isRecord } from './business-contracts.mts';
import { ownedDiagnostic } from './business-owned-diagnostics.mts';
import type { createBusinessOwnedResetStore } from './business-owned-reset-store.mts';
interface Policy {
  enabled: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
  webhookSecret: string;
}
const reply = (status: number) =>
  new Response(null, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
export function createBusinessOwnedResetEvents(
  config: Policy,
  store: Pick<ReturnType<typeof createBusinessOwnedResetStore>, 'reconcile'>,
  now = Date.now,
) {
  const policy = Object.freeze({ ...config });
  if (
    policy.realm !== 'business' ||
    policy.origin !== 'https://business.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId) ||
    policy.webhookSecret.length < 25 ||
    policy.webhookSecret.length > 256
  )
    throw Error('Invalid business reset event configuration.');
  return async (request: Request) => {
    if (policy.enabled !== true) return reply(503);
    const url = new URL(request.url);
    if (
      url.origin !== policy.origin ||
      url.pathname !== '/auth/owned/reset-events' ||
      url.search ||
      url.hash ||
      request.method !== 'POST'
    )
      return reply(404);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
    let eventId: string, resetId: string, subject: string;
    try {
      if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
        throw Error();
      const fields = /^t=(\d{13}),\s*v1=([a-f0-9]{64})$/.exec(
        request.headers.get('workos-signature') || '',
      );
      if (!fields?.[1] || !fields[2] || Math.abs(now() - Number(fields[1])) > 180000) throw Error();
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(
        await boundedBody(request.body, signal, 16384),
      );
      const expected = createHmac('sha256', policy.webhookSecret)
        .update(`${fields[1]}.${raw}`)
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(fields[2], 'hex'))) throw Error();
      const event: unknown = JSON.parse(raw);
      if (
        !isRecord(event) ||
        !isRecord(event.context) ||
        event.context.client_id !== policy.clientId
      )
        throw Error();
      if (event.event !== 'password_reset.succeeded') return reply(200);
      if (
        typeof event.id !== 'string' ||
        !/^event_[A-Za-z0-9]{1,80}$/.test(event.id) ||
        !isRecord(event.data) ||
        event.data.object !== 'password_reset' ||
        typeof event.data.id !== 'string' ||
        !/^password_reset_[A-Za-z0-9]{1,80}$/.test(event.data.id) ||
        typeof event.data.user_id !== 'string' ||
        !/^user_[A-Za-z0-9]{1,80}$/.test(event.data.user_id)
      )
        throw Error();
      eventId = event.id;
      resetId = event.data.id;
      subject = event.data.user_id;
    } catch {
      return reply(401);
    }
    try {
      // One short atomic DB command; no account-provider call, queue or polling.
      // Respond 200 only after commit so provider retry can recover a DB outage.
      await store.reconcile(eventId, resetId, subject, signal);
      return reply(200);
    } catch {
      ownedDiagnostic('reset_event_commit_failed');
      return reply(503);
    }
  };
}
