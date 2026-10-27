import { stagingFetch, stagingEmailPolicy } from '../../supabase/functions/_shared/staging-egress';

const config = {
  projectUrl: 'https://ohrcupagdoilkwhecict.supabase.co',
  orchestratorUrl: 'https://doji-orchestrator-staging.faheygs.workers.dev',
  ablyKey: 'eVKl2g.synthetic:synthetic',
};
const upstream = jest
  .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
  .mockResolvedValue(new Response('synthetic'));
beforeEach(() => upstream.mockClear());

test.each([
  {},
  { ...config, projectUrl: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
  { ...config, orchestratorUrl: 'https://doji-orchestrator.faheygs.workers.dev' },
  { ...config, ablyKey: 'production.synthetic:synthetic' },
])('rejects incomplete or mixed configuration', (invalid) => {
  expect(() => stagingFetch(invalid, upstream)).toThrow('connections rejected');
  expect(upstream).not.toHaveBeenCalled();
});

test.each([
  'https://exp.host/--/api/v2/push/send',
  'https://api.resend.com/emails',
  'https://api.push.apple.com/3/device/test',
  'https://fcm.googleapis.com/v1/projects/test/messages:send',
  'https://tvixsmqxotuvyjqzmjla.supabase.co/rest/v1/rpc/test',
  'https://doji-orchestrator.faheygs.workers.dev/outbox/wake',
  'https://ohrcupagdoilkwhecict.supabase.co.evil.invalid/',
  'http://rest.ably.io/time',
  'https://rest.ably.io:444/time',
  'https://rest.ably.io/time?key=secret',
  'https://rest.ably.io/channels/test/messages',
])('denies unapproved egress without network: %s', async (url) => {
  await expect(stagingFetch(config, upstream)(url)).rejects.toThrow('destination denied');
  expect(upstream).not.toHaveBeenCalled();
});

test.each([config.projectUrl, config.orchestratorUrl, 'https://rest.ably.io/time'])(
  'allows exact staging dependencies',
  async (url) => {
    const signal = new AbortController().signal;
    await stagingFetch(config, upstream)(url, { signal });
    const request = upstream.mock.calls[0][0] as Request;
    expect(request.url).toBe(new URL(url).href);
    expect(request.redirect).toBe('error');
    expect(request.signal.aborted).toBe(false);
  },
);

test('Ably requests require the configured staging key and preserve payloads', async () => {
  const send = stagingFetch(config, upstream);
  const url = 'https://main.realtime.ably.net/messages';
  await expect(send(url, { headers: { authorization: 'Basic production' } })).rejects.toThrow(
    'destination denied',
  );
  const request = new Request(url, {
    method: 'POST',
    body: '{"synthetic":true}',
    headers: { authorization: `Basic ${btoa(config.ablyKey)}` },
  });
  await send(request);
  const forwarded = upstream.mock.calls[0][0] as Request;
  expect(await forwarded.text()).toBe('{"synthetic":true}');
  expect(forwarded.redirect).toBe('error');
});

const email = {
  key: 'synthetic-staging-key',
  from: 'Doji Staging <staging@example.test>',
  recipients: ['approved@example.test'],
};
const message = {
  from: email.from,
  to: email.recipients,
  subject: '[STAGING] Synthetic report',
  html: '<a href="https://admin-staging.dojipro.com/">Open staging</a>',
  text: 'Staging test',
};
const sendEmail = (body: unknown = message, headers = {}, url = 'https://api.resend.com/emails') =>
  stagingFetch({ ...config, email }, upstream)(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${email.key}`,
      'content-type': 'application/json',
      'idempotency-key': 'staging/admin-report/synthetic',
      ...headers,
    },
  });

test('explicit single-recipient email policy preserves content, idempotency and no redirects', async () => {
  await sendEmail();
  const request = upstream.mock.calls[0][0] as Request;
  expect(await request.json()).toEqual(message);
  expect(request.redirect).toBe('error');
  expect(request.headers.get('idempotency-key')).toBe('staging/admin-report/synthetic');
});

test.each([
  { to: ['other@example.test'] },
  { to: ['approved@example.test', 'other@example.test'] },
  { to: [] },
  { to: 'approved@example.test' },
  { bcc: ['other@example.test'] },
  { cc: ['other@example.test'] },
  { reply_to: 'other@example.test' },
  { attachments: [] },
  { from: 'Doji <production@example.test>' },
  { subject: 'Unlabelled' },
  { html: '<a href="https://admin.dojipro.com/">Production</a>' },
  { text: 'https://admin.dojipro.com/' },
  { html: null },
  { text: null },
])('rejects email escape before provider I/O: %j', async (patch) => {
  await expect(sendEmail({ ...message, ...patch })).rejects.toThrow('denied');
  expect(upstream).not.toHaveBeenCalled();
});

test.each([
  { authorization: 'Bearer production' },
  { 'idempotency-key': 'production/test' },
  { 'content-type': 'text/plain' },
])('rejects incorrect email headers: %j', async (headers) => {
  await expect(sendEmail(message, headers)).rejects.toThrow('denied');
  expect(upstream).not.toHaveBeenCalled();
});

test('rejects large bodies and alternate provider paths without forwarding', async () => {
  await expect(sendEmail({ ...message, text: 'x'.repeat(131073) })).rejects.toThrow('too large');
  await expect(sendEmail(message, {}, 'https://api.resend.com/emails/batch')).rejects.toThrow(
    'denied',
  );
  expect(upstream).not.toHaveBeenCalled();
});

test.each([
  ['', email.from, JSON.stringify(email.recipients)],
  [email.key, 'Doji <production@example.test>', JSON.stringify(email.recipients)],
  [email.key, email.from, '[]'],
  [email.key, email.from, '["bad"]'],
  [email.key, email.from, JSON.stringify(Array(6).fill('approved@example.test'))],
])('rejects incomplete staging mail policy', (key, from, recipients) => {
  expect(() => stagingEmailPolicy(key, from, recipients)).toThrow();
  expect(upstream).not.toHaveBeenCalled();
});
