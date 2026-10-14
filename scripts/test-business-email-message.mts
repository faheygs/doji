import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareBusinessMail } from '../infra/business-email/message.mts';
const job = {
  id: '12345678-1234-4234-8234-123456789012',
  application_id: '12345678-1234-4234-8234-123456789013',
  kind: 'submit',
  subject: 'user_fixture',
  issuer: 'https://business.test',
  audience: 'client_business',
};
const user = { id: 'user_fixture', email: 'business@test.invalid', email_verified: true };
test('approved setup email contains navigation only, not a sign-in or access token', () => {
  const result = prepareBusinessMail({ ...job, kind: 'approve' }, user, job, {
    setupEnabled: true,
  });
  assert.match(
    result.text,
    /Finish setup: https:\/\/business.dojipro.com\/business-portal\/setup\//,
  );
  assert.doesNotMatch(result.text, /token|password|user_fixture/);
  for (const link of result.text.match(/https:\/\/\S+/g) ?? []) {
    assert.equal(new URL(link).search, '');
    assert.equal(new URL(link).hash, '');
  }
  assert.match(result.text, /authenticator/);
});
test('all transactional messages use the verified business recipient and private portal link', () => {
  for (const kind of ['submit', 'approve', 'decline', 'request_changes', 'reopen']) {
    const result = prepareBusinessMail(
      { ...job, kind },
      { ...user, internal_note: 'private-secret' },
      job,
    );
    assert.equal(result.to, user.email);
    assert.match(result.html, /Doji logo/);
    assert.match(result.html, /DOJI FOR BUSINESS/);
    assert.match(result.html, />View application<\/a>/);
    assert.match(result.html, /background:#b83b1b/);
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
