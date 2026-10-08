// Exact business Turnstile checks before allocating a durable login flow.
import { isIP } from 'node:net';
import { boundedBody } from './bounded-body.mts';
import { record } from './portal-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
export interface BusinessAdmissionConfig {
  origin: string;
  turnstileSecret: string;
}
export function createBusinessAdmission(
  config: BusinessAdmissionConfig,
  client: { ip: string },
  upstream: PortalFetch = fetch,
) {
  if (
    config.origin !== 'https://business.dojipro.com' ||
    !/^[A-Za-z0-9_-]{20,256}$/.test(config.turnstileSecret)
  )
    throw Error('Business admission configuration unavailable');
  const policy = structuredClone(config),
    trusted = { ...client };
  return async ({
    signup,
    proof,
    signal,
  }: {
    signup: boolean;
    proof: unknown;
    signal: AbortSignal;
  }) => {
    if (
      signal.aborted ||
      !isIP(trusted.ip) ||
      typeof proof !== 'string' ||
      proof.length < 1 ||
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
        body: JSON.stringify({
          secret: policy.turnstileSecret,
          response: proof,
          remoteip: trusted.ip,
        }),
      });
      if (!response.ok) return false;
      const value: unknown = JSON.parse(
        new TextDecoder().decode(await boundedBody(response.body, deadline, 16384)),
      );
      return (
        !deadline.aborted &&
        record(value) &&
        value.success === true &&
        value.hostname === 'business.dojipro.com' &&
        value.action === (signup ? 'business_register' : 'business_signin')
      );
    } catch {
      return false;
    }
  };
}
