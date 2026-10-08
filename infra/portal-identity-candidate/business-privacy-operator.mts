// Manual operator primitive. Never imported by Pages/Edge or scheduled.
import { createHash } from 'node:crypto';
import { boundedBody } from './bounded-body.mts';
import { record } from './portal-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
export interface BusinessPrivacyOperatorConfig {
  enabled: boolean;
  realm: 'business';
  clientId: string;
  apiKey: string;
}
export type BusinessPrivacySql = (
  operation: 'export' | 'claim' | 'finish',
  values: (string | number)[],
) => Promise<unknown>;
const unavailable = () => Error('Business privacy operation requires restricted review');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createBusinessPrivacyOperator(
  config: BusinessPrivacyOperatorConfig,
  sql: BusinessPrivacySql,
  upstream: PortalFetch = fetch,
) {
  if (
    !config ||
    config.realm !== 'business' ||
    !/^client_[A-Za-z0-9]+$/.test(config.clientId) ||
    !/^sk_[A-Za-z0-9_-]{8,256}$/.test(config.apiKey)
  )
    throw unavailable();
  const policy = structuredClone(config),
    issuer = `https://api.workos.com/user_management/${policy.clientId}`;
  function active(caseId: string) {
    if (!policy.enabled || !uuid.test(caseId)) throw unavailable();
  }
  function target(value: unknown, caseId: string) {
    if (
      !record(value) ||
      value.case_id !== caseId ||
      typeof value.account_id !== 'string' ||
      !uuid.test(value.account_id) ||
      typeof value.subject !== 'string' ||
      !/^user_[A-Za-z0-9]{1,80}$/.test(value.subject) ||
      value.issuer !== issuer ||
      value.audience !== policy.clientId
    )
      throw unavailable();
    return {
      subject: value.subject,
      account_id: value.account_id,
      kind: value.kind,
      state: value.state,
      revision: value.revision,
      delete_authorized: value.delete_authorized,
    };
  }
  async function request(subject: string, method: 'GET' | 'DELETE') {
    const signal = AbortSignal.timeout(5000);
    try {
      const response = await upstream(`https://api.workos.com/user_management/users/${subject}`, {
        method,
        redirect: 'error',
        signal,
        headers: { authorization: `Bearer ${policy.apiKey}` },
      });
      const bytes = response.body
        ? await boundedBody(response.body, signal, 32768)
        : new Uint8Array();
      if (method === 'DELETE') return { absent: false, ok: response.ok, user: null, evidence: '' };
      // Exact authenticated provider endpoint, no redirect/error-body inference.
      if (response.status === 404)
        return {
          absent: true,
          ok: true,
          user: null,
          evidence:
            'workos-404:' +
            createHash('sha256')
              .update(JSON.stringify([policy.clientId, subject, Date.now(), 404]))
              .digest('hex'),
        };
      const user: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!response.ok || !record(user) || user.object !== 'user' || user.id !== subject)
        throw unavailable();
      return { absent: false, ok: true, user, evidence: '' };
    } catch {
      throw unavailable();
    }
  }
  return Object.freeze({
    async exportIdentity(caseId: string, revision: number) {
      active(caseId);
      if (!Number.isSafeInteger(revision) || revision < 1) throw unavailable();
      const t = target(await sql('export', [caseId, revision, issuer, policy.clientId]), caseId);
      if (t.kind !== 'access' || t.state !== 'open' || t.revision !== revision) throw unavailable();
      const read = await request(t.subject, 'GET');
      if (!read.user) throw unavailable();
      const identity: Record<string, unknown> = {};
      for (const name of [
        'id',
        'email',
        'email_verified',
        'first_name',
        'last_name',
        'name',
        'created_at',
        'updated_at',
        'last_sign_in_at',
      ]) {
        const value = read.user[name];
        if (
          value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'string' && value.length <= 2048)
        )
          identity[name] = value;
      }
      // Recheck that staff has not closed/changed the case during the provider read.
      const current = target(
        await sql('export', [caseId, revision, issuer, policy.clientId]),
        caseId,
      );
      if (
        current.kind !== 'access' ||
        current.state !== 'open' ||
        current.revision !== revision ||
        current.account_id !== t.account_id ||
        current.subject !== t.subject
      )
        throw unavailable();
      return {
        case_id: caseId,
        account_id: t.account_id,
        identity_source: 'workos_business',
        identity,
        scope: 'identity_profile_only',
        additional_review:
          'Combine with the case application export; assess provider security records and retention separately.',
      };
    },
    async erase(caseId: string, executionId: string) {
      active(caseId);
      if (!uuid.test(executionId)) throw unavailable();
      const t = target(await sql('claim', [caseId, executionId, issuer, policy.clientId]), caseId);
      if (
        t.kind !== 'erasure' ||
        !['executing', 'primary_erased', 'completed'].includes(String(t.state))
      )
        throw unavailable();
      if (t.state === 'primary_erased' || t.state === 'completed') return { state: t.state };
      let read = await request(t.subject, 'GET');
      if (!read.absent) {
        if (t.delete_authorized !== true) return { state: 'needs_provider_review' };
        // Claim is durable before DELETE. A lost response is not permission to retry.
        try {
          if (!(await request(t.subject, 'DELETE')).ok) return { state: 'needs_provider_review' };
        } catch {
          return { state: 'needs_provider_review' };
        }
        read = await request(t.subject, 'GET');
        if (!read.absent) return { state: 'needs_provider_review' };
      }
      const finished = await sql('finish', [
        caseId,
        executionId,
        issuer,
        policy.clientId,
        t.subject,
        read.evidence,
      ]);
      if (!record(finished) || !['primary_erased', 'completed'].includes(String(finished.state)))
        throw unavailable();
      return { state: finished.state };
    },
  });
}
