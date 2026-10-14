// Business-only candidate. No defaults enable sending; no retry or background job.
import { createHash } from 'node:crypto';
import { boundedBody } from './bounded-body.mts';
import { isRecord } from './business-contracts.mts';
import type { OwnedResetMetadata } from './business-owned-provider.mts';
import { renderBusinessEmailHtml } from '../business-email/theme.mts';

export interface BusinessRecoveryEmailPolicy {
  enabled: boolean;
  workosDefaultEmailDisabled: boolean;
  trackingDisabled: boolean;
  // Release evidence expires; this is not a substitute for the durable send budget.
  capacityApprovedUntil: number;
  apiKey: string;
  from: string;
}
const denied = () => Error('Business recovery delivery unavailable.');
export function createBusinessRecoveryEmail(
  config: BusinessRecoveryEmailPolicy | undefined,
  upstream: typeof fetch,
  now = Date.now,
) {
  const policy = config ? Object.freeze({ ...config }) : undefined;
  const assertReady = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (
      !policy ||
      policy.enabled !== true ||
      policy.workosDefaultEmailDisabled !== true ||
      policy.trackingDisabled !== true ||
      !Number.isSafeInteger(policy.capacityApprovedUntil) ||
      policy.capacityApprovedUntil <= now() ||
      policy.capacityApprovedUntil > now() + 86400000 ||
      !/^re_[A-Za-z0-9_-]{20,}$/.test(policy.apiKey) ||
      !/^(?:[A-Za-z0-9._+-]+@(?:[A-Za-z0-9-]+\.)*dojipro\.com|Doji(?: for Business)? <[A-Za-z0-9._+-]+@(?:[A-Za-z0-9-]+\.)*dojipro\.com>)$/.test(
        policy.from,
      )
    )
      throw denied();
  };
  return Object.freeze({
    assertReady,
    async send(email: string, metadata: OwnedResetMetadata, token: string, signal: AbortSignal) {
      assertReady(signal);
      if (
        !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) ||
        email.length > 254 ||
        !/^[\x21-\x7e]{20,8192}$/.test(token) ||
        createHash('sha256').update(token).digest('hex') !== metadata.tokenHash ||
        !Number.isSafeInteger(metadata.expires) ||
        metadata.expires <= now() ||
        metadata.expires > now() + 86400000 ||
        !/^password_reset_[A-Za-z0-9]{1,80}$/.test(metadata.resetId)
      )
        throw denied();
      // A fragment is never part of the HTTP request URL. No redirect/tracking URL.
      const link =
        'https://business.dojipro.com/business-portal/access/?mode=reset#' +
        new URLSearchParams({ token });
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      try {
        const result = await upstream('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          signal: deadline,
          headers: {
            Authorization: `Bearer ${policy!.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `business-owned-reset/${metadata.resetId}`,
          },
          body: JSON.stringify({
            from: policy!.from,
            to: [email],
            subject: 'Reset your Doji business password',
            html: renderBusinessEmailHtml({
              title: 'Reset your password',
              preheader: 'Choose a new password for your Doji business account.',
              summary:
                'Choose a new password for your business account. Opening this email or link does not change your password.',
              action: { label: 'Reset password', href: link },
              details: [
                { label: 'Link expires (UTC)', value: new Date(metadata.expires).toISOString() },
              ],
              note: 'If you did not request this, ignore this email. Your personal Doji account is separate.',
            }),
            text: `Doji for Business\n\nChoose a new password for your business account:\n\n${link}\n\nThis link expires at ${new Date(metadata.expires).toISOString()}. Opening it does not change your password.\n\nIf you did not request this, ignore this email. Your personal Doji account is separate.`,
          }),
        });
        const data: unknown = JSON.parse(
          new TextDecoder().decode(await boundedBody(result.body, deadline, 4096)),
        );
        deadline.throwIfAborted();
        if (
          result.status !== 200 ||
          !isRecord(data) ||
          typeof data.id !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(data.id)
        )
          throw denied();
        // API acceptance only; do not claim delivery or expose provider IDs/bodies.
      } catch {
        throw denied();
      }
    },
  });
}
