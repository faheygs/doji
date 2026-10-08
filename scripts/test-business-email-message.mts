import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareBusinessMail } from '../infra/business-email-candidate/message.mts';
const job = {
  id: '12345678-1234-4234-8234-123456789012',
  application_id: '12345678-1234-4234-8234-123456789013',
  kind: 'submit',
  subject: 'user_fixture',
  issuer: 'https://business.test',
  audience: 'client_business',
};
const user = { id: 'user_fixture', email: 'business@test.invalid', email_verified: true };
test('all transactional messages use the verified business recipient and private portal link', () => {
  for (const kind of ['submit', 'approve', 'decline', 'request_changes', 'reopen']) {
    const result = prepareBusinessMail(
      { ...job, kind },
      { ...user, internal_note: 'private-secret' },
      job,
    );
    assert.equal(result.to, user.email);
    assert.match(result.text, /Application reference: 12345678/);
    assert.match(
      result.text,
      /https:\/\/business.dojipro.com\/business-portal\/access\/\?mode=signin/,
    );
    assert.doesNotMatch(JSON.stringify(result), /private-secret|token=|password|within.*hours/);
    assert.equal(result.idempotencyKey, 'business-application/' + job.id);
  }
});
test('wrong directory, subject, unverified and unsafe addresses fail closed', () => {
  for (const input of [
    null,
    [],
    {},
    { ...user, id: 'user_other' },
    { ...user, email_verified: false },
    { ...user, email_verified: 'true' },
    { ...user, email: 'bad\r\nbcc: victim@test.invalid' },
    { ...user, email: 'bad' },
  ])
    assert.throws(() => prepareBusinessMail(job, input, job));
  assert.throws(() => prepareBusinessMail(job, user, { ...job, audience: 'employee' }));
  for (const patch of [{ kind: '__proto__' }, { id: 'bad' }, { subject: 'bad' }])
    assert.throws(() => prepareBusinessMail({ ...job, ...patch }, user, job));
});
