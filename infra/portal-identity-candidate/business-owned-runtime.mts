// Prepared composition only; all provider mutation and sending remain explicit gates.
import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createBusinessOwnedAdmission } from './business-owned-admission.mts';
import { createBusinessOwnedGuard } from './business-owned-guard.mts';
import { createBusinessOwnedProvider } from './business-owned-provider.mts';
import { createBusinessOwnedResetStore } from './business-owned-reset-store.mts';
import { createBusinessOwnedReset } from './business-owned-reset.mts';
import { createBusinessOwnedResetEvents } from './business-owned-reset-events.mts';
import { createBusinessOwnedHttp } from './business-owned-http.mts';
import { createBusinessOwnedSessionInstaller } from './business-owned-session.mts';
import type { BusinessRuntimeConfig } from './business-runtime.mts';
import type { BusinessHttpDependencies } from './business-http-contracts.mts';
import type { createRestrictedSql } from './restricted-sql.mts';
import type { PortalFetch } from './portal-contracts.mts';
import {
  createBusinessRecoveryEmail,
  type BusinessRecoveryEmailPolicy,
} from './business-owned-recovery-email.mts';

export interface BusinessOwnedRuntimeConfig {
  enabled: boolean;
  sendingEnabled: boolean;
  acceptanceOnly?: boolean;
  admissionHmacKey: string;
  operationHmacKey: string;
  webhookSecret: string;
  recoveryEmail?: BusinessRecoveryEmailPolicy;
}

export function createBusinessOwnedRuntime(
  config: BusinessRuntimeConfig,
  deps: Pick<BusinessHttpDependencies, 'store' | 'provider' | 'application' | 'verify'> & {
    execute: ReturnType<typeof createRestrictedSql>;
    upstream: PortalFetch;
    now: () => number;
  },
) {
  const policy = structuredClone(config),
    owned = policy.ownedAuth;
  if (
    !owned ||
    owned.enabled !== true ||
    typeof owned.sendingEnabled !== 'boolean' ||
    (owned.acceptanceOnly !== undefined && typeof owned.acceptanceOnly !== 'boolean') ||
    (owned.acceptanceOnly === true && policy.signupEnabled !== false) ||
    new Set([owned.admissionHmacKey, owned.operationHmacKey, policy.encryptionKey]).size !== 3 ||
    owned.webhookSecret === policy.actionSecret ||
    owned.webhookSecret === policy.apiKey
  )
    throw Error('Business owned authentication configuration unavailable.');
  const cfg = { ...policy, ...owned, enabled: policy.enabled && owned.enabled };
  const guard = createBusinessOwnedGuard({ ...cfg, enabled: true }, deps.execute, deps.now);
  const resets = createBusinessOwnedResetStore({ ...cfg, enabled: true }, deps.execute, deps.now);
  const recoveryEmail = createBusinessRecoveryEmail(
    owned.recoveryEmail,
    (input, init) => deps.upstream(String(input), init || {}),
    deps.now,
  );
  const provider = createBusinessOwnedProvider(
    {
      ...cfg,
      customResetEmailEnabled:
        owned.recoveryEmail?.enabled === true &&
        owned.recoveryEmail.workosDefaultEmailDisabled === true,
    },
    (input, init) => deps.upstream(String(input), init || {}),
  );
  const events = createBusinessOwnedResetEvents(cfg, resets, deps.now);
  const install = createBusinessOwnedSessionInstaller(cfg, { ...deps, guard });
  const scope = createHash('sha256').update(`${cfg.origin}|${cfg.clientId}`).digest('hex');
  // Validate proof configuration before serving, without network traffic.
  createBusinessOwnedAdmission(cfg, { ip: '' }, deps.upstream);
  // Validate the operation key even if the first request is a webhook/bootstrap.
  if (!/^[a-f0-9]{64}$/.test(owned.operationHmacKey))
    throw Error('Business owned authentication configuration unavailable.');
  return async (request: Request, client: { ip: string }) => {
    if (new URL(request.url).pathname === '/auth/owned/reset-events') return events(request);
    const verifyProof = createBusinessOwnedAdmission(cfg, client, deps.upstream);
    const reset = createBusinessOwnedReset(cfg, {
      provider,
      guard: {
        admit: guard.admit,
        beginReset: resets.beginReset,
        completeReset: resets.completeReset,
      },
      resolve: resets.resolve,
      verifyProof: (proof, signal) => verifyProof('reset', proof, signal),
      trustedClientIp: client.ip,
      now: deps.now,
    });
    // Acceptance registration uses a separate one-slot database gate. The public
    // signup flag and its expired counter/cutoff must remain closed and untouched.
    return createBusinessOwnedHttp(
      { ...cfg, signupEnabled: cfg.signupEnabled || owned.acceptanceOnly === true },
      {
        store: deps.store,
        provider,
        guard,
        verifyProof,
        install,
        reset,
        trustedClientIp: client.ip,
        now: deps.now,
        rememberReset: resets.remember,
        recoveryEmail,
        reserveRecoveryEmail: async (ticket, signal) => {
          const result = await deps.execute(
            'doji_business_session',
            'select business_session_private.reserve_owned_recovery_email_v1($1,$2) as result',
            [scope, ticket],
            signal,
          );
          return (
            typeof result === 'object' &&
            result !== null &&
            'state' in result &&
            result.state === 'reserved'
          );
        },
        reserve: async (id, agreement, signal, identityKey) => {
          if (cfg.enabled && cfg.sendingEnabled && owned.acceptanceOnly === true)
            return (
              (await deps.execute(
                'doji_business_session',
                'select business_session_private.reserve_owned_acceptance_v1($1,$2,$3,$4) as result',
                [
                  scope,
                  identityKey,
                  createHash('sha256').update(`owned|${id}`).digest('hex'),
                  createHmac('sha256', Buffer.from(owned.admissionHmacKey, 'hex'))
                    .update(`owned-registration|${id}|${JSON.stringify(agreement)}`)
                    .digest('hex'),
                ],
                signal,
              )) === true
            );
          if (!cfg.enabled || !cfg.sendingEnabled || !cfg.signupEnabled) return false;
          // Existing DB-owned cutoff/cap remains authoritative. No automatic refund.
          return (
            (await deps.execute(
              'doji_business_registration',
              'select business_session_private.reserve_registration($1,$2,$3) as result',
              [
                scope,
                createHash('sha256').update(`owned|${id}`).digest('hex'),
                createHmac('sha256', Buffer.from(owned.admissionHmacKey, 'hex'))
                  .update(`owned-registration|${id}|${JSON.stringify(agreement)}`)
                  .digest('hex'),
              ],
              signal,
            )) === true
          );
        },
      },
    )(request);
  };
}
