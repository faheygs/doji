import { createHash, webcrypto } from 'node:crypto';
import {
  safetyRemoval,
  type SafetyRemovalEnv,
} from '../../supabase/functions/_shared/safety-removal';
import { safetyRemovalAlerts } from '../../supabase/functions/_shared/safety-removal-alerts';
import {
  cloudflareMailBase,
  classifyCloudflareMail,
  sendSafetyAlert,
  verifySafetyAlertDestination,
  safetyAlertRecipient,
  safetyAlertSender,
} from '../../supabase/functions/_shared/safety-removal-cloudflare';
import {
  escapeHtml,
  humanizeEmailToken,
  formatEmailTimestamp,
  renderDojiEmail,
} from '../../supabase/functions/_shared/doji-email';

const id = '11111111-1111-4111-8111-111111111111';
const origin = 'https://synthetic.invalid';
const env: SafetyRemovalEnv = {
  enabled: true,
  origin,
  supabaseUrl: 'https://database.invalid/',
  serviceKey: 'sb_secret_synthetic',
  turnstileSecret: 'synthetic-challenge',
};
const details = {
  name: 'Synthetic reporter',
  contact: 'synthetic@example.invalid',
  relationship: 'witness',
  location: 'synthetic record',
  statement: 'Synthetic testing only',
  signature: 'Synthetic',
  consent: true,
  reason: 'harassment',
  detail: 'bullying',
};
const body = (submit = true) => ({
  action: submit ? 'submit' : 'status',
  id,
  secret: 'a'.repeat(64),
  verification: 'synthetic',
  ...(submit ? { request: { ...details } } : {}),
});
const request = (data: unknown = body(), method = 'POST', headers: Record<string, string> = {}) =>
  new Request(`${origin}/intake`, {
    method,
    headers: { origin, 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
  });
const receipt = {
  id,
  received_at: '2026-10-02T00:00:00Z',
  state: 'received',
  deadline_at: '2026-10-04T00:00:00Z',
  message: 'Received',
  updated_at: '2026-10-02T00:00:00Z',
};
const verified = { success: true, hostname: 'synthetic.invalid', action: 'safety_removal' };
const transport = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }),
);
beforeEach(() =>
  transport
    .mockReset()
    .mockImplementation(async (url) =>
      Response.json(String(url).includes('turnstile') ? verified : receipt),
    ),
);
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

describe('external safety intake real handler', () => {
  test.each([
    [{ enabled: false }, {}, 'POST', 503],
    [{ origin: '' }, {}, 'POST', 403],
    [{}, { origin: 'https://attacker.invalid' }, 'POST', 403],
    [{}, {}, 'OPTIONS', 204],
    [{}, {}, 'GET', 405],
    [{ serviceKey: '' }, {}, 'POST', 503],
    [{ turnstileSecret: '' }, {}, 'POST', 503],
    [{ supabaseUrl: '' }, {}, 'POST', 503],
    [{}, { 'content-type': 'multipart/form-data' }, 'POST', 415],
  ])(
    'gates disabled/method/origin/config/media requests',
    async (patch, headers, method, status) => {
      const res = await safetyRemoval(
        request(body(), method as string, headers as Record<string, string>),
        { ...env, ...(patch as Partial<SafetyRemovalEnv>) },
        transport,
      );
      expect(res.status).toBe(status);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test.each([null, [], 'text', 1])('rejects nonobject body %j', async (value) => {
    expect((await safetyRemoval(request(value), env, transport)).status).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  test.each(['{', 'x'.repeat(24001)])('rejects malformed/oversized body', async (value) => {
    expect(
      (
        await safetyRemoval(
          new Request(`${origin}/intake`, {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: value,
          }),
          env,
          transport,
        )
      ).status,
    ).toBe(400);
  });
  test.each([
    { admin: true },
    { action: 'delete' },
    { id: 1 },
    { id: 'bad' },
    { secret: 1 },
    { secret: 'bad' },
    { verification: null },
    { verification: '' },
    { verification: 'x'.repeat(2049) },
  ])('rejects envelope %j before provider calls', async (patch) => {
    expect((await safetyRemoval(request({ ...body(), ...patch }), env, transport)).status).toBe(
      400,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  test.each([
    null,
    [],
    { ...details, priority: 'urgent' },
    { ...details, consent: false },
    { ...details, relationship: 'staff' },
    { ...details, reason: null },
    { ...details, reason: 'invalid-dash' },
    { ...details, detail: 1 },
    { ...details, detail: 'invalid-dash' },
  ])('rejects invalid declarations/routing injection %j', async (data) => {
    expect(
      (await safetyRemoval(request({ ...body(), request: data }), env, transport)).status,
    ).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  test.each(
    Object.entries({
      name: 160,
      contact: 500,
      location: 3000,
      statement: 3000,
      signature: 160,
    }).flatMap(([key, max]) => [
      [key, null],
      [key, ' '],
      [key, 'x'.repeat(max + 1)],
    ]),
  )('rejects invalid %s text', async (key, value) => {
    expect(
      (
        await safetyRemoval(
          request({ ...body(), request: { ...details, [key as string]: value } }),
          env,
          transport,
        )
      ).status,
    ).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  test('status cannot contain a new submission', async () => {
    expect(
      (await safetyRemoval(request({ ...body(false), request: details }), env, transport)).status,
    ).toBe(400);
  });
  test.each([
    null,
    [],
    { ...verified, success: false },
    { ...verified, hostname: 'other.invalid' },
    { ...verified, action: 'other' },
  ])('requires exact challenge binding %j', async (verification) => {
    transport.mockResolvedValue(Response.json(verification));
    expect((await safetyRemoval(request(), env, transport)).status).toBe(400);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test('challenge HTTP failure cannot be ignored', async () => {
    transport.mockResolvedValue(Response.json(verified, { status: 500 }));
    expect((await safetyRemoval(request(), env, transport)).status).toBe(400);
  });
  test.each([true, false])(
    'hashes private receipt code and projects only public fields, submission=%s',
    async (submit) => {
      transport.mockResolvedValueOnce(Response.json(verified)).mockResolvedValueOnce(
        Response.json({
          ...receipt,
          contact: 'private',
          internal_notes: 'private',
          token_hash: 'private',
        }),
      );
      const res = await safetyRemoval(request(body(submit)), env, transport);
      expect(res.status).toBe(submit ? 201 : 200);
      expect(await res.json()).toEqual(receipt);
      const [url, init] = transport.mock.calls[1];
      expect(url).toBe(
        `https://database.invalid/rest/v1/rpc/${submit ? 'submit_safety_removal_v1' : 'get_safety_removal_status_v1'}`,
      );
      expect(JSON.parse(init?.body as string)).toEqual({
        p_id: id,
        p_token_hash: createHash('sha256').update(body().secret).digest('hex'),
        ...(submit ? { p_request: details } : {}),
      });
      expect(init?.body).not.toContain(body().secret);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    },
  );
  test.each([
    [false, 'P0002', 404],
    [true, 'P0002', 503],
    [true, '22023', 400],
    [false, '22023', 400],
    [true, 'P0001', 429],
    [true, 'unknown', 503],
  ] as const)(
    'maps submit=%s database %s to %i without exposing detail',
    async (submit, code, status) => {
      transport
        .mockResolvedValueOnce(Response.json(verified))
        .mockResolvedValueOnce(Response.json({ code, message: 'private detail' }, { status: 400 }));
      const res = await safetyRemoval(request(body(submit)), env, transport);
      expect(res.status).toBe(status);
      expect(await res.text()).not.toContain('private detail');
    },
  );
  test.each([
    null,
    [],
    { ...receipt, id: 'other' },
    { ...receipt, received_at: null },
    { ...receipt, state: null },
  ])('unconfirmed receipt never counts as success %j', async (value) => {
    transport
      .mockResolvedValueOnce(Response.json(verified))
      .mockResolvedValueOnce(Response.json(value));
    expect((await safetyRemoval(request(), env, transport)).status).toBe(503);
  });
  test.each(['transport', 'error body', 'success body'])(
    'handles %s failure generically',
    async (failure) => {
      if (failure === 'transport') transport.mockRejectedValue(new Error('private secret'));
      else
        transport
          .mockResolvedValueOnce(Response.json(verified))
          .mockResolvedValueOnce(
            new Response('private secret', { status: failure === 'error body' ? 503 : 200 }),
          );
      const res = await safetyRemoval(request(), env, transport);
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain('private secret');
    },
  );
});

const config = { accountId: 'a'.repeat(32), token: 'synthetic-token' };
const mail = {
  reference: id,
  from: safetyAlertSender,
  to: safetyAlertRecipient,
  html: '<p>Synthetic</p>',
  text: 'Synthetic',
};
const mailResult = (kind = 'delivered') => ({
  success: true,
  result: {
    message_id: 'synthetic-message',
    delivered: kind === 'delivered' ? [safetyAlertRecipient] : [],
    queued: kind === 'queued' ? [safetyAlertRecipient] : [],
    permanent_bounces: kind === 'bounced' ? [safetyAlertRecipient] : [],
    suppressed_recipients: kind === 'suppressed' ? [safetyAlertRecipient] : [],
  },
});
describe('restricted Cloudflare mail boundary', () => {
  test.each([
    { ...config, accountId: 'bad' },
    { ...config, token: '' },
  ])('rejects invalid configuration', (value) => {
    expect(() => cloudflareMailBase(value)).toThrow('Mail configuration unavailable');
  });
  test('constructs exact account base', () => {
    expect(cloudflareMailBase(config)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}`,
    );
  });
  test.each([
    [true, [{ email: safetyAlertRecipient, verified: '2026-01-01T00:00:00Z' }], true],
    [false, [], false],
    [true, {}, false],
    [true, [{ email: 'other' }], false],
    [true, [{ email: safetyAlertRecipient, verified: false }], false],
    [true, [{ email: safetyAlertRecipient, verified: 'bad' }], false],
  ])('requires the fixed verified destination', async (success, result, expected) => {
    transport.mockResolvedValue(Response.json({ success, result }));
    expect(await verifySafetyAlertDestination(config, transport)).toBe(expected);
    expect(transport.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      signal: expect.any(AbortSignal),
      headers: { authorization: 'Bearer synthetic-token' },
    });
  });
  test('HTTP failure is not verified destination', async () => {
    transport.mockResolvedValue(Response.json({ success: true, result: [] }, { status: 500 }));
    expect(await verifySafetyAlertDestination(config, transport)).toBe(false);
  });
  test.each([199, 300, 400, 401, 408, 429, 500])(
    'classifies status %i with bounded retry policy',
    (status) => {
      expect(classifyCloudflareMail(status, {})).toEqual({
        providerId: null,
        status: 'rejected',
        terminal: status >= 400 && status < 500 && ![408, 429].includes(status),
      });
    },
  );
  test.each(['delivered', 'queued', 'bounced', 'suppressed'])(
    'distinguishes provider outcome %s',
    (kind) => {
      expect(classifyCloudflareMail(200, mailResult(kind))).toEqual({
        providerId: ['delivered', 'queued'].includes(kind) ? 'synthetic-message' : null,
        status: kind,
        terminal: ['bounced', 'suppressed'].includes(kind),
      });
    },
  );
  test.each([
    null,
    'text',
    {},
    { success: false },
    { success: true },
    { success: true, result: {} },
    {
      ...mailResult(),
      result: { ...mailResult().result, delivered: ['unexpected@example.invalid'] },
    },
    { ...mailResult(), result: { ...mailResult().result, delivered: [] } },
    { ...mailResult(), result: { ...mailResult().result, queued: [safetyAlertRecipient] } },
    { ...mailResult(), result: { ...mailResult().result, message_id: null } },
    { ...mailResult(), result: { ...mailResult().result, message_id: 'bad\nheader' } },
  ])('ambiguous envelope is never success %j', (value) => {
    expect(classifyCloudflareMail(200, value)).toEqual({
      providerId: null,
      status: 'uncertain',
      terminal: false,
    });
  });
  test('optional suppression list can be omitted', () => {
    const value = mailResult();
    Reflect.deleteProperty(value.result, 'suppressed_recipients');
    expect(classifyCloudflareMail(200, value).status).toBe('delivered');
  });
  test.each([{ from: 'other' }, { to: 'other' }, { reference: 'bad' }])(
    'cannot send outside approved envelope %j',
    async (patch) => {
      await expect(sendSafetyAlert(config, { ...mail, ...patch }, transport)).rejects.toThrow(
        'Invalid alert envelope',
      );
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test('sends one bounded request with correlation, not invented idempotency', async () => {
    transport.mockResolvedValue(Response.json(mailResult()));
    expect((await sendSafetyAlert(config, mail, transport)).status).toBe('delivered');
    const [, init] = transport.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toMatchObject({
      from: mail.from,
      to: mail.to,
      headers: { 'X-Doji-Alert-Reference': id },
    });
    expect(new Headers(init?.headers).has('idempotency-key')).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test.each(['network', 'json'])(
    'ambiguous %s send remains uncertain, not retried',
    async (failure) => {
      if (failure === 'network') transport.mockRejectedValue(new Error('provider'));
      else transport.mockResolvedValue(new Response('not json'));
      expect(await sendSafetyAlert(config, mail, transport)).toEqual({
        providerId: null,
        status: 'uncertain',
        terminal: false,
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
});

describe('durable external-intake alert dispatch', () => {
  const alertEnv = {
    enabled: true,
    secret: 'synthetic',
    supabaseUrl: 'https://database.invalid/',
    serviceKey: 'sb_secret_synthetic',
    cloudflareAccountId: config.accountId,
    cloudflareToken: config.token,
  };
  const alert = {
    id,
    lease_id: id,
    deadline_at: '2026-10-04T00:00:00Z',
    queue: 'restricted_safety',
    envelope: { from: safetyAlertSender, to: safetyAlertRecipient },
  };
  const req = (method = 'POST', auth = 'Bearer synthetic') =>
    new Request(`${origin}/alerts`, { method, headers: { authorization: auth } });
  function mock(claims: unknown = [alert], outcome: unknown = mailResult(), saved: unknown = true) {
    transport.mockImplementation(async (url) => {
      const address = String(url);
      if (address.includes('/addresses'))
        return Response.json({
          success: true,
          result: [{ email: safetyAlertRecipient, verified: '2026-01-01' }],
        });
      if (address.includes('/claim_')) return Response.json(claims);
      if (address.includes('/send')) return Response.json(outcome);
      return Response.json(saved);
    });
  }
  test.each([
    [{ enabled: false }, 'POST', 'Bearer synthetic', 503],
    [{ secret: '' }, 'POST', 'Bearer synthetic', 401],
    [{}, 'POST', 'bad', 401],
    [{}, 'GET', 'Bearer synthetic', 405],
    [{ supabaseUrl: '' }, 'POST', 'Bearer synthetic', 503],
    [{ serviceKey: '' }, 'POST', 'Bearer synthetic', 503],
  ])('gates dispatch before provider requests', async (patch, method, auth, status) => {
    const res = await safetyRemovalAlerts(
      req(method as string, auth as string),
      { ...alertEnv, ...(patch as Partial<typeof alertEnv>) },
      transport,
    );
    expect(res.status).toBe(status);
    expect(transport).not.toHaveBeenCalled();
  });
  test('invalid mail config does not claim durable work', async () => {
    expect(
      (await safetyRemovalAlerts(req(), { ...alertEnv, cloudflareToken: '' }, transport)).status,
    ).toBe(503);
    expect(transport).not.toHaveBeenCalled();
  });
  test('unverified destination leaves alerts unclaimed', async () => {
    transport.mockResolvedValue(Response.json({ success: true, result: [] }));
    const res = await safetyRemovalAlerts(req(), alertEnv, transport);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('Verified administrator');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test.each([null, {}, Array(4).fill(alert)])(
    'rejects invalid bounded claim batch %j',
    async (claims) => {
      mock(claims);
      expect((await safetyRemovalAlerts(req(), alertEnv, transport)).status).toBe(503);
      expect(transport.mock.calls.some(([url]) => String(url).includes('/send'))).toBe(false);
    },
  );
  test.each([
    { id: 'bad' },
    { lease_id: 'bad' },
    { deadline_at: 'bad' },
    { queue: 'public' },
    { envelope: null },
    { envelope: { ...alert.envelope, to: 'other' } },
    { envelope: { ...alert.envelope, from: 'other' } },
  ])('rejects malformed alert %j before email', async (patch) => {
    mock([{ ...alert, ...patch }]);
    expect((await safetyRemovalAlerts(req(), alertEnv, transport)).status).toBe(503);
    expect(transport.mock.calls.some(([url]) => String(url).includes('/send'))).toBe(false);
  });
  test.each(['moderation', 'restricted_safety'])(
    'routes private minimal alert to %s queue',
    async (queue) => {
      mock([{ ...alert, queue, private_body: 'NEVER EXPOSE' }]);
      const res = await safetyRemovalAlerts(req(), alertEnv, transport);
      expect(await res.json()).toEqual({ claimed: 1, accepted: 1 });
      const sent = transport.mock.calls.find(([url]) => String(url).includes('/send'))!;
      const payload = JSON.parse(sent[1]?.body as string);
      expect(payload.html).toContain(
        `https://admin.dojipro.com/#${queue === 'moderation' ? 'moderation' : 'safety'}`,
      );
      expect(payload.html).not.toContain('NEVER EXPOSE');
      const finished = transport.mock.calls.find(([url]) => String(url).includes('/finish_'))!;
      expect(JSON.parse(finished[1]?.body as string)).toEqual({
        p_id: id,
        p_lease_id: id,
        p_provider_id: 'synthetic-message',
        p_terminal: false,
        p_delivery_status: 'delivered',
      });
    },
  );
  test('empty queue is healthy without a send', async () => {
    mock([]);
    expect(await (await safetyRemovalAlerts(req(), alertEnv, transport)).json()).toEqual({
      claimed: 0,
      accepted: 0,
    });
  });
  test('provider bounce is persisted but not accepted', async () => {
    mock([alert], mailResult('bounced'));
    expect(await (await safetyRemovalAlerts(req(), alertEnv, transport)).json()).toEqual({
      claimed: 1,
      accepted: 0,
    });
  });
  test('missing durable acknowledgement cannot report success', async () => {
    mock([alert], mailResult(), false);
    expect((await safetyRemovalAlerts(req(), alertEnv, transport)).status).toBe(503);
  });
  test('database HTTP failure leaves recovery pending', async () => {
    mock();
    const current = transport.getMockImplementation()!;
    transport.mockImplementation((url, init) =>
      String(url).includes('/rpc/')
        ? Promise.resolve(new Response('private', { status: 503 }))
        : current(url, init),
    );
    const response = await safetyRemovalAlerts(req(), alertEnv, transport);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
});

describe('safe email rendering contracts', () => {
  test('escapes markup and handles missing text', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
    expect(escapeHtml(null)).toBe('');
  });
  test.each([
    [null, 'Not available'],
    [' ', 'Not available'],
    ['realtime_provider:slow-path', 'Realtime Provider Slow Path'],
  ])('humanizes operational labels %s', (value, expected) => {
    expect(humanizeEmailToken(value)).toBe(expected);
  });
  test.each([null, 'bad'])('invalid timestamp %s is explicit', (value) => {
    expect(formatEmailTimestamp(value)).toBe('Not available');
  });
  test('valid timestamps are UTC', () => {
    expect(formatEmailTimestamp('2026-10-02T01:02:00Z')).toContain('UTC');
  });
  test('minimal email uses neutral defaults and transactional footer', () => {
    const value = renderDojiEmail({
      preheader: 'Preview',
      eyebrow: 'Update',
      title: '<Title>',
      summary: 'Line1\nLine2',
    });
    expect(value.html).toContain('&lt;Title&gt;');
    expect(value.html).toContain('Line1<br>Line2');
    expect(value.html).toContain('#6f7788');
    expect(value.text).toContain('transactional message');
    expect(value.text).not.toContain('Reference:');
  });
  test.each(['neutral', 'info', 'success', 'warning', 'danger', 'critical'] as const)(
    'renders %s tone with optional fields safely',
    (tone) => {
      const value = renderDojiEmail({
        preheader: 'Preview',
        eyebrow: 'Update',
        title: 'Title',
        summary: 'Body',
        tone,
        statusLabel: '<State>',
        facts: [
          { label: 'One', value: 'Value', monospace: true },
          { label: 'Two', value: '<other>' },
        ],
        sections: [
          { heading: 'Empty' },
          { heading: 'Details', body: 'Paragraph', bullets: ['<bullet>'] },
          { heading: 'Blank', body: '', bullets: [] },
        ],
        actions: [
          { label: 'Open', href: 'https://synthetic.invalid/?a="x"' },
          { label: 'Mail', href: 'mailto:support@example.invalid', kind: 'secondary' },
          { label: 'App', href: 'doit://feed' },
          { label: 'Unsafe', href: 'javascript:alert(1)' },
        ],
        reference: ' test-reference ',
        footerNote: ' Custom footer ',
      });
      expect(value.html).toContain('&lt;State&gt;');
      expect(value.html).toContain('&lt;bullet&gt;');
      expect(value.html).toContain('href="#"');
      expect(value.html).not.toContain('href="javascript:');
      expect(value.text).toContain('Reference: test-reference');
      expect(value.text).toContain('Custom footer');
      expect(value.text).toContain('- <bullet>');
    },
  );
});
