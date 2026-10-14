import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dispatchBusinessMail,
  type MailConfig,
} from '../infra/business-email/dispatch.mts';
const config: MailConfig = {
  enabled: true,
  setupEnabled: true,
  clientId: 'client_business',
  workosKey: 'sk_' + 'x'.repeat(24),
  resendKey: 're_' + 'y'.repeat(24),
  from: 'business@mail.dojipro.com',
};
const job = {
  id: '11000000-0000-4000-8000-000000000001',
  lease_token: '11000000-0000-4000-8000-000000000002',
  application_id: '11000000-0000-4000-8000-000000000003',
  kind: 'approve',
  subject: 'user_business',
  issuer: 'https://api.workos.com/user_management/client_business',
  audience: 'client_business',
};
function fixture(
  options: {
    enabled?: boolean;
    stale?: boolean;
    wrongDirectory?: boolean;
    unverified?: boolean;
    timeout?: boolean;
    lostReceipt?: boolean;
  } = {},
) {
  const events: string[] = [];
  let dispatched = false;
  return {
    events,
    run: () =>
      dispatchBusinessMail(
        { ...config, enabled: options.enabled ?? true },
        async (query, params) => {
          if (query.includes('claim_application')) {
            events.push('claim');
            return dispatched
              ? null
              : { ...job, ...(options.wrongDirectory ? { audience: 'employee' } : {}) };
          }
          if (query.includes('authorize_application')) {
            events.push('authorize');
            dispatched = true;
            return options.stale ? null : job;
          }
          events.push('finish:' + params[2]);
          if (options.lostReceipt) throw Error('synthetic lost receipt');
          assert.equal(params[3], params[2] === 'accepted' ? job.id : null);
          return null;
        },
        async (url, init) => {
          assert.equal(init.redirect, 'error');
          assert.ok(init.signal);
          if (url.startsWith('https://api.workos.com/')) {
            events.push('user');
            return Response.json({
              id: job.subject,
              email: 'owner@test.invalid',
              email_verified: !options.unverified,
            });
          }
          assert.equal(url, 'https://api.resend.com/emails');
          events.push('send');
          assert.equal(
            new Headers(init.headers).get('Idempotency-Key'),
            'business-application/' + job.id,
          );
          const body = JSON.parse(String(init.body));
          assert.match(body.text, /Finish setup:/);
          assert.match(body.html, /<html lang="en">/);
          assert.match(body.html, />Finish setup<\/a>/);
          assert.deepEqual(body.to, ['owner@test.invalid']);
          if (options.timeout) throw Error('synthetic timeout');
          return Response.json({ id: job.id });
        },
      ),
  };
}
test('disabled sender has no database or provider activity', async () => {
  const f = fixture({ enabled: false });
  assert.equal((await f.run()).state, 'disabled');
  assert.deepEqual(f.events, []);
});
test('one-use authorization precedes send and acceptance is not delivery', async () => {
  const f = fixture();
  assert.equal((await f.run()).state, 'accepted');
  assert.deepEqual(f.events, ['claim', 'user', 'authorize', 'send', 'finish:accepted']);
  assert.equal((await f.run()).state, 'idle');
});
test('stale approval stops before sending', async () => {
  const f = fixture({ stale: true });
  assert.equal((await f.run()).state, 'withheld');
  assert.ok(!f.events.includes('send'));
});
test('wrong directory is rejected before provider reads', async () => {
  const f = fixture({ wrongDirectory: true });
  assert.equal((await f.run()).state, 'cancelled');
  assert.deepEqual(f.events, ['claim', 'finish:cancelled']);
});
test('unverified recipient is not mailed', async () => {
  const f = fixture({ unverified: true });
  assert.equal((await f.run()).state, 'cancelled');
  assert.ok(!f.events.includes('send'));
});
test('provider timeout remains uncertain without automatic retry', async () => {
  const f = fixture({ timeout: true });
  assert.equal((await f.run()).state, 'uncertain');
  await f.run();
  assert.equal(f.events.filter((x) => x === 'send').length, 1);
});
test('lost receipt never resends a provider-accepted message', async () => {
  const f = fixture({ lostReceipt: true });
  await assert.rejects(f.run());
  await f.run();
  assert.equal(f.events.filter((x) => x === 'send').length, 1);
});
