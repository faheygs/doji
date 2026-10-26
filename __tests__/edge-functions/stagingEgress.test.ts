import { stagingFetch } from '../../supabase/functions/_shared/staging-egress';

const config = {
  projectUrl: 'https://ohrcupagdoilkwhecict.supabase.co',
  orchestratorUrl: 'https://doji-orchestrator-staging.faheygs.workers.dev',
  ablyKey: 'eVKl2g.synthetic:synthetic',
};
const upstream = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(new Response('synthetic'));
beforeEach(() => upstream.mockClear());

test.each([
  {}, { ...config, projectUrl: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
  { ...config, orchestratorUrl: 'https://doji-orchestrator.faheygs.workers.dev' },
  { ...config, ablyKey: 'production.synthetic:synthetic' },
])('rejects incomplete or mixed configuration', invalid => {
  expect(() => stagingFetch(invalid, upstream)).toThrow('connections rejected');
  expect(upstream).not.toHaveBeenCalled();
});

test.each([
  'https://exp.host/--/api/v2/push/send', 'https://api.resend.com/emails',
  'https://api.push.apple.com/3/device/test', 'https://fcm.googleapis.com/v1/projects/test/messages:send',
  'https://tvixsmqxotuvyjqzmjla.supabase.co/rest/v1/rpc/test',
  'https://doji-orchestrator.faheygs.workers.dev/outbox/wake',
  'https://ohrcupagdoilkwhecict.supabase.co.evil.invalid/',
  'http://rest.ably.io/time', 'https://rest.ably.io:444/time',
  'https://rest.ably.io/time?key=secret', 'https://rest.ably.io/channels/test/messages',
])('denies unapproved egress without network: %s', async url => {
  await expect(stagingFetch(config, upstream)(url)).rejects.toThrow('destination denied');
  expect(upstream).not.toHaveBeenCalled();
});

test.each([config.projectUrl, config.orchestratorUrl, 'https://rest.ably.io/time'])('allows exact staging dependencies', async url => {
  const signal = new AbortController().signal;
  await stagingFetch(config, upstream)(url, { signal });
  const request = upstream.mock.calls[0][0] as Request;
  expect(request.url).toBe(new URL(url).href);
  expect(request.redirect).toBe('error');
  expect(request.signal.aborted).toBe(false);
});

test('Ably requests require the configured staging key and preserve payloads', async () => {
  const send = stagingFetch(config, upstream);
  const url = 'https://main.realtime.ably.net/messages';
  await expect(send(url, { headers: { authorization: 'Basic production' } })).rejects.toThrow('destination denied');
  const request = new Request(url, { method: 'POST', body: '{"synthetic":true}',
    headers: { authorization: `Basic ${btoa(config.ablyKey)}` } });
  await send(request);
  const forwarded = upstream.mock.calls[0][0] as Request;
  expect(await forwarded.text()).toBe('{"synthetic":true}');
  expect(forwarded.redirect).toBe('error');
});
