// Independent business action proof; no member/employee authentication changes.
import { isIP } from 'node:net';
import { boundedBody } from './bounded-body.mts';
import { record } from './portal-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
import type { OwnedFlowDependencies } from './business-owned-flow.mts';

export function createBusinessOwnedAdmission(
  config: { origin: string; turnstileSecret: string },
  client: { ip: string },
  upstream: PortalFetch,
): OwnedFlowDependencies['verifyProof'] {
  const { origin, turnstileSecret } = config,
    ip = client.ip;
  if (origin !== 'https://business.dojipro.com' || !/^[A-Za-z0-9_-]{20,256}$/.test(turnstileSecret))
    throw Error('Business admission unavailable.');
  return async (action, proof, signal) => {
    if (
      signal.aborted ||
      !isIP(ip) ||
      !['signin', 'register', 'verify', 'mfa', 'recover', 'reset'].includes(action) ||
      typeof proof !== 'string' ||
      !proof ||
      proof.length > 2048
    )
      return false;
    try {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(4000)]);
      const response = await upstream('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        redirect: 'error',
        signal: deadline,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: turnstileSecret, response: proof, remoteip: ip }),
      });
      if (!response.ok) return false;
      const value: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await boundedBody(response.body, deadline, 16384),
        ),
      );
      return (
        !deadline.aborted &&
        record(value) &&
        value.success === true &&
        value.hostname === 'business.dojipro.com' &&
        value.action === `business_${action}`
      );
    } catch {
      return false;
    }
  };
}
