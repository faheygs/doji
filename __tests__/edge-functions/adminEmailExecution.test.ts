jest.mock(
  'https://esm.sh/@supabase/supabase-js@2',
  () => ({ createClient: () => ({ rpc: mockRpc, from: mockFrom }) }),
  { virtual: true },
);
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const transport = jest.fn();
const remove = jest.fn();
const eq = jest.fn();
const read = jest.fn();
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const originalFetch = global.fetch;
let handler: (request: Request) => Promise<Response>;
let settings: Record<string, string | undefined>;
const load = () =>
  jest.isolateModules(() => require('../../supabase/functions/send-admin-email/index'));
const request = (
  payload: unknown = {
    event: 'report',
    report_id: 'synthetic-report',
    reporter_id: 'synthetic-reporter',
  },
  kind = 'cron',
) =>
  new Request('https://synthetic.invalid', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(kind === 'cron'
        ? { authorization: 'Bearer synthetic-cron' }
        : kind === 'outbox'
          ? { 'x-outbox-secret': 'synthetic-outbox' }
          : {}),
    },
    body: JSON.stringify(payload),
  });
const message = () => JSON.parse(transport.mock.calls[0][1].body);
beforeEach(() => {
  settings = {
    SUPABASE_URL: 'https://database.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    CRON_SECRET: 'synthetic-cron',
    OUTBOX_RELAY_SECRET: 'synthetic-outbox',
    RESEND_API_KEY: 'synthetic-mail',
  };
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: {
      env: { get: (key: string) => settings[key] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
  });
  mockRpc.mockReset().mockResolvedValue({ data: 'synthetic-receipt' });
  read.mockReset().mockResolvedValue({ data: null });
  eq.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockReturnValue({ eq });
  mockFrom.mockReset().mockImplementation(() => {
    const q = { select: jest.fn(), eq: jest.fn(), maybeSingle: read, delete: remove };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    return q;
  });
  transport
    .mockReset()
    .mockImplementation(async () => Response.json({ id: 'synthetic-provider-id' }));
  global.fetch = transport;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  load();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, 'Deno', descriptor);
  else Reflect.deleteProperty(globalThis, 'Deno');
});
test('unauthorized caller cannot send', async () => {
  expect((await handler(request({}, 'none'))).status).toBe(401);
  expect(transport).not.toHaveBeenCalled();
});
test('missing cron config fails closed', async () => {
  settings.CRON_SECRET = undefined;
  expect((await handler(request())).status).toBe(500);
  expect(transport).not.toHaveBeenCalled();
});
test('operational alerts require outbox secret even with valid cron', async () => {
  expect((await handler(request({ event: 'operational_health' }))).status).toBe(401);
});
test('report alerts require cron even with valid outbox secret', async () => {
  expect((await handler(request({ event: 'report' }, 'outbox'))).status).toBe(401);
});
test('outbox authorized operational mail does not require cron secret', async () => {
  settings.CRON_SECRET = undefined;
  expect((await handler(request({ event: 'operational_health' }, 'outbox'))).status).toBe(200);
});
test('missing provider key fails before reads/sends', async () => {
  settings.RESEND_API_KEY = '';
  expect((await handler(request())).status).toBe(500);
  expect(mockFrom).not.toHaveBeenCalled();
});
test('unknown event is rejected', async () => {
  expect((await handler(request({ event: 'unknown' }))).status).toBe(400);
  expect(transport).not.toHaveBeenCalled();
});
test('minimal report has safe category, account and target fallbacks', async () => {
  expect((await handler(request())).status).toBe(200);
  const email = message();
  expect(email.subject).toContain('Other: Not specified');
  expect(email.text).toContain('Unknown account');
  expect(email.text).toContain('synthetic-reporter');
  expect(email.text).toContain('Not specified');
  expect(email.text).not.toContain('Reporter context');
  expect(email.from).toBe('Doji <noreply@doji.app>');
  expect(email.to).toEqual(['faheygs@gmail.com']);
  expect(transport.mock.calls[0][1].headers['Idempotency-Key']).toBe(
    'admin-report/synthetic-report',
  );
});
test.each([
  ['sexual_content', 'child_sexual_content', 'Critical'],
  ['self_harm', 'other', 'High priority'],
  ['violence_hate_exploitation', '', 'High priority'],
  ['unknown_category', '', 'Standard'],
])('report %s/%s is classified for %s review', async (reason, detail, expected) => {
  read
    .mockResolvedValueOnce({ data: { username: 'reporter', display_name: 'Synthetic Reporter' } })
    .mockResolvedValueOnce({ data: { username: 'target' } });
  expect(
    (
      await handler(
        request({
          event: 'report',
          report_id: 'synthetic-report',
          reporter_id: 'reporter',
          reported_user_id: 'target',
          reason,
          reason_detail: detail,
          target_kind: 'comment',
          comment_id: 'comment',
          notes: '<Synthetic>\nContext',
          created_at: '2026-10-02T00:00:00Z',
        }),
      )
    ).status,
  ).toBe(200);
  const email = message();
  expect(email.text).toContain(expected);
  expect(email.text).toContain('Synthetic Reporter (@reporter)');
  expect(email.text).toContain('@target');
  expect(email.html).toContain('&lt;Synthetic&gt;<br>Context');
  expect(email.text).toContain('Content reference: comment');
});
test.each([
  ['post_id', 'post'],
  ['poll_vote_id', 'content'],
])('report %s uses reference and default %s target', async (key, target) => {
  expect(
    (
      await handler(
        request({ event: 'report', report_id: 'r', reporter_id: 'u', [key]: 'target-id' }),
      )
    ).status,
  ).toBe(200);
  expect(message().text).toContain('Content reference: target-id');
  expect(message().text).toContain(`Reported target: ${target[0].toUpperCase()}${target.slice(1)}`);
});
test('configured recipient and sender are used without changing defaults globally', async () => {
  settings.ADMIN_ALERT_EMAIL = 'synthetic-admin@example.invalid';
  settings.ADMIN_FROM_EMAIL = 'synthetic-sender@example.invalid';
  load();
  await handler(request());
  expect(message()).toMatchObject({
    to: ['synthetic-admin@example.invalid'],
    from: 'synthetic-sender@example.invalid',
  });
});
test.each([null, false, 1])('deduplicated operational receipt %s suppresses send', async (data) => {
  mockRpc.mockResolvedValue({ data });
  expect(await (await handler(request({ event: 'operational_health' }, 'outbox'))).json()).toEqual({
    ok: true,
    deduplicated: true,
  });
  expect(transport).not.toHaveBeenCalled();
});
test('receipt claim failure does not send or delete a guessed receipt', async () => {
  mockRpc.mockResolvedValue({ error: { message: 'claim' } });
  expect((await handler(request({ event: 'operational_health' }, 'outbox'))).status).toBe(500);
  expect(transport).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
test.each([
  ['realtime-delivery-degraded', 'relay-wake-or-supabase-edge', 'wake, claim'],
  ['realtime-delivery-degraded', 'relay-or-publication-path', 'wake, claim'],
  ['realtime-delivery-degraded', 'provider', 'failed database acknowledgement'],
  ['realtime-delivery-degraded', undefined, 'failed database acknowledgement'],
  ['domain-outbox-delayed', '', 'underlying application writes remain committed'],
  ['domain-outbox-exhausted', '', 'underlying application writes remain committed'],
  ['push-delayed', '', 'Native notification delivery'],
  ['apns-credentials', '', 'Native notification delivery'],
  ['health-failure', '', 'protected production monitor'],
  [undefined, '', 'protected production monitor'],
])('operational %s uses evidence-based guidance for %s', async (family, layer, expected) => {
  expect(
    (
      await handler(
        request(
          {
            event: 'operational_health',
            issue_family: family,
            suspected_layer: layer,
            observed_at: '2026-10-02T00:00:00Z',
          },
          'outbox',
        ),
      )
    ).status,
  ).toBe(200);
  expect(message().text).toContain(expected);
  expect(transport.mock.calls[0][1].headers['Idempotency-Key']).toBe(
    'operational-alert/synthetic-receipt',
  );
});
test.each([true, false])(
  'operational facts distinguish measured values and writes-at-risk=%s',
  async (risk) => {
    const payload = {
      event: 'operational_health',
      issue_family: 'unsafe family!'.repeat(20),
      immediate: risk,
      checked_at: '2026-10-02T00:00:00Z',
      source: 'synthetic_monitor',
      realtime_p95_ms_5m: 1200,
      realtime_max_ms_5m: null,
      realtime_sample_count_5m: 'bad',
      outbox_overdue: 0,
      failure_kind: 'timeout',
      durable_event_state: 'committed',
      database_writes_at_risk: risk,
    };
    expect((await handler(request(payload, 'outbox'))).status).toBe(200);
    expect(mockRpc.mock.calls[0][1].p_issue_family).toHaveLength(120);
    const text = message().text;
    expect(text).toContain('1,200 ms');
    expect(text).not.toContain('Realtime samples (5m)');
    expect(text).toContain('Committed writes at risk: ' + (risk ? 'Yes' : 'No'));
    expect(text).toContain('Failure class: Timeout');
    expect(message().subject).toContain(risk ? '[INCIDENT]' : '[Degraded]');
  },
);
test.each(['report', 'operational_health'])(
  'provider HTTP rejection for %s clears only an existing operational receipt',
  async (event) => {
    transport.mockResolvedValue(Response.json({ message: 'synthetic-rejection' }, { status: 503 }));
    expect((await handler(request({ event }, event === 'report' ? 'cron' : 'outbox'))).status).toBe(
      500,
    );
    expect(remove).toHaveBeenCalledTimes(event === 'operational_health' ? 1 : 0);
    if (event === 'operational_health')
      expect(eq).toHaveBeenCalledWith('idempotency_key', 'synthetic-receipt');
  },
);
test.each([new Error('transport'), 'transport'])(
  'ambiguous operational failure releases receipt for recovery',
  async (error) => {
    transport.mockRejectedValue(error);
    expect((await handler(request({ event: 'operational_health' }, 'outbox'))).status).toBe(500);
    expect(eq).toHaveBeenCalledWith('idempotency_key', 'synthetic-receipt');
  },
);
test('malformed provider result takes recovery path', async () => {
  transport.mockResolvedValue(new Response('not json'));
  expect((await handler(request({ event: 'operational_health' }, 'outbox'))).status).toBe(500);
  expect(remove).toHaveBeenCalledTimes(1);
});
test('successful provider handoff returns reference without deleting receipt', async () => {
  const res = await handler(request({ event: 'operational_health' }, 'outbox'));
  expect(await res.json()).toEqual({ ok: true, id: 'synthetic-provider-id' });
  expect(remove).not.toHaveBeenCalled();
});
