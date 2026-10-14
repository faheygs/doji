// Server-only, one bounded job per explicit invocation. No scheduler or enabled
// production entrypoint. SQL must use the dedicated doji_business_mail role.
import { prepareBusinessMail, type BusinessMailJob } from './message.mts';
import { boundedBody } from '../portal-identity/bounded-body.mts';
import { isRecord } from '../portal-identity/business-contracts.mts';
import type { PortalFetch } from '../portal-identity/portal-contracts.mts';
export type MailSql = (query: string, parameters: (string | null)[]) => Promise<unknown>;
export interface MailConfig {
  enabled: boolean;
  clientId: string;
  workosKey: string;
  resendKey: string;
  from: string;
  setupEnabled: boolean;
  allowedRecipient?: string;
}
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const claimSql = 'select business_private.claim_application_email() as result';
const authorizeSql =
  'select business_private.authorize_application_email($1::uuid,$2::uuid) as result';
const finishSql =
  'select business_private.finish_application_email($1::uuid,$2::uuid,$3,$4) as result';
export async function dispatchBusinessMail(
  config: MailConfig,
  sql: MailSql,
  upstream: PortalFetch = fetch,
  target?: { id: string; nonce: string },
) {
  if (!config.enabled) return { state: 'disabled' };
  if (
    !/^client_[A-Za-z0-9]+$/.test(config.clientId) ||
    !/^sk_[A-Za-z0-9_-]{20,}$/.test(config.workosKey) ||
    !/^re_[A-Za-z0-9_-]{10,}$/.test(config.resendKey) ||
    !/^[A-Za-z0-9._+-]+@mail\.dojipro\.com$/.test(config.from)
  )
    throw Error('Invalid business sender configuration');
  const pinned = {
    issuer: `https://api.workos.com/user_management/${config.clientId}`,
    audience: config.clientId,
  };
  if (target && (!uuid.test(target.id) || !uuid.test(target.nonce)))
    throw Error('Invalid mail target');
  const job = await sql(
    target
      ? 'select business_private.claim_application_email($1::uuid,$2::uuid) as result'
      : claimSql,
    target ? [target.id, target.nonce] : [],
  );
  if (job === null) return { state: 'idle' };
  if (
    !isRecord(job) ||
    typeof job.id !== 'string' ||
    !uuid.test(job.id) ||
    typeof job.lease_token !== 'string' ||
    !uuid.test(job.lease_token)
  )
    throw Error('Invalid mail claim');
  const finish = async (state: string, provider: string | null = null) => {
    await sql(finishSql, [job.id as string, job.lease_token as string, state, provider]);
    return { state };
  };
  async function json(url: string, init: RequestInit) {
    const signal = AbortSignal.timeout(5000);
    const response = await upstream(url, { ...init, signal, redirect: 'error' });
    if (!response.ok) throw Error('Business mail provider unavailable');
    return JSON.parse(
      new TextDecoder().decode(await boundedBody(response.body, signal, 32768)),
    ) as unknown;
  }
  let message: ReturnType<typeof prepareBusinessMail>;
  try {
    // Validate the claim and directory before any provider request.
    prepareBusinessMail(
      job as unknown as BusinessMailJob,
      { id: job.subject, email: 'validation@test.invalid', email_verified: true },
      pinned,
    );
    const user = await json(`https://api.workos.com/user_management/users/${job.subject}`, {
      headers: { authorization: `Bearer ${config.workosKey}` },
      method: 'GET',
    });
    message = prepareBusinessMail(job as unknown as BusinessMailJob, user, pinned, config);
    if (
      config.allowedRecipient &&
      message.to.toLowerCase() !== config.allowedRecipient.toLowerCase()
    )
      return finish('cancelled');
  } catch {
    return finish('cancelled');
  }
  const authorized = await sql(authorizeSql, [job.id, job.lease_token]);
  if (authorized === null) return { state: 'withheld' };
  if (
    !isRecord(authorized) ||
    ['id', 'application_id', 'kind', 'subject', 'issuer', 'audience'].some(
      (key) => authorized[key] !== job[key],
    )
  )
    return finish('cancelled');
  let providerId: string;
  try {
    const result = await json('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.resendKey}`,
        'content-type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!isRecord(result) || typeof result.id !== 'string' || !uuid.test(result.id))
      throw Error('Uncertain mail result');
    providerId = result.id;
  } catch {
    return finish('uncertain');
  }
  // A failed receipt write must not trigger another provider call.
  return finish('accepted', providerId);
}
