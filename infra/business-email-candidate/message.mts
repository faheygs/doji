// Local-only mail preparation. No provider client, API key, network or send function.
export interface BusinessMailJob {
  id: string;
  application_id: string;
  kind: string;
  subject: string;
  issuer: string;
  audience: string;
}
const notices: Record<string, readonly [string, string]> = {
  submit: [
    'We received your business application',
    'Your application is with Doji for review. You do not need to submit it again.',
  ],
  approve: [
    'Your Doji business application is approved',
    'Your business application has been approved. Sign in to view the next steps. Campaign publishing and billing are not enabled.',
  ],
  decline: [
    'An update on your Doji business application',
    'Doji has reviewed your application. Sign in to read the decision and any information provided.',
  ],
  request_changes: [
    'Your business application needs an update',
    'Doji has requested changes to your application. Sign in to read the note and update your details.',
  ],
  reopen: [
    'Your business application needs your attention',
    'There is an update to your application. Sign in to review the current status and next steps.',
  ],
};
export function prepareBusinessMail(
  job: BusinessMailJob,
  providerUser: unknown,
  pinned: { issuer: string; audience: string },
) {
  if (
    job.issuer !== pinned.issuer ||
    job.audience !== pinned.audience ||
    !pinned.issuer ||
    !pinned.audience
  )
    throw Error('Wrong business directory');
  if (!/^user_[A-Za-z0-9]{1,80}$/.test(job.subject)) throw Error('Invalid business subject');
  const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (!uuid.test(job.id) || !uuid.test(job.application_id) || !Object.hasOwn(notices, job.kind))
    throw Error('Invalid mail job');
  if (!providerUser || typeof providerUser !== 'object' || Array.isArray(providerUser))
    throw Error('Verified business email required');
  const user = providerUser as Record<string, unknown>;
  // Official WorkOS get-user response, not a browser/JWT hint or application field.
  if (
    user.id !== job.subject ||
    user.email_verified !== true ||
    typeof user.email !== 'string' ||
    user.email.length > 254 ||
    /[,;:"\\()[\]]/.test(user.email) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(user.email)
  )
    throw Error('Verified business email required');
  const [subject, introduction] = notices[job.kind]!;
  return {
    to: user.email,
    subject,
    idempotencyKey: 'business-application/' + job.id,
    text: `${introduction}\n\nApplication reference: ${job.application_id}\n\nView your application: https://business.dojipro.com/business-portal/access/?mode=signin\n\nNeed help? https://dojipro.com/support/\n\nDoji for Business`,
  };
}
