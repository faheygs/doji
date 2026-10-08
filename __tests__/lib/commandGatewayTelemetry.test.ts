import { executeCommand } from '../../lib/commandGateway';
import { reportApiFailure } from '../../lib/apiFailureTelemetry';
import { supabase } from '../../lib/supabase';
jest.mock('../../lib/supabase', () => ({ supabase: { auth: {
  getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'local-test-token' } }, error: null }),
  refreshSession: jest.fn(),
} } }));
jest.mock('../../lib/apiFailureTelemetry', () => ({ ...jest.requireActual('../../lib/apiFailureTelemetry'), reportApiFailure: jest.fn() }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({ platform: 'ios', releaseChannel: 'test' }) }));
const originalFetch = global.fetch;
const originalUrl = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
beforeEach(() => jest.clearAllMocks());
afterEach(() => { global.fetch = originalFetch;
  jest.useRealTimers();
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalUrl;
});
test('one command retry preserves the key and reports the final HTTP failure with status', async () => {
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://audit.invalid';
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500,
    text: async () => JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }) });
  const result = await executeCommand('submit_policy_report', {
    p_idempotency_key: 'local-test-report-intent', p_reported_user_id: 'author', p_post_id: 'post',
    p_comment_id: null, p_poll_vote_id: null, p_target_kind: 'post', p_reason: 'spam_scam',
    p_reason_detail: 'spam', p_notes: null,
  });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(calls[0][1].body).toBe(calls[1][1].body);
  expect(result.error).toMatchObject({ code: '57014', status: 500 });
  expect(reportApiFailure).toHaveBeenCalledTimes(1);
  expect(reportApiFailure).toHaveBeenCalledWith('command', 'submit_policy_report', result.error,
    expect.objectContaining({ attempt_count: 2, attempts: expect.any(Array) }));
});

test('native generic abort preserves deadline classification after the bounded retry', async () => {
  jest.useFakeTimers();
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://audit.invalid';
  global.fetch = jest.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  }));
  const pending = executeCommand('register_native_push_endpoint', {
    p_installation_id: 'local-install', p_token: 'local-only-token', p_platform: 'ios',
    p_environment: 'sandbox', p_expo_token: null,
  });
  await jest.advanceTimersByTimeAsync(24_250);
  const result = await pending;
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(result.error?.message).toBe('Command timed out');
  expect(reportApiFailure).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('an account-bound command never dispatches with another account token', async () => {
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://audit.invalid';
  global.fetch = jest.fn();
  (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: {
    session: { access_token: 'other-token', user: { id: 'other' } },
  }, error: null });
  const result = await executeCommand('dismiss_notification', { p_notification_key: 'a', p_dismissed_at: 'now' },
    { expectedUserId: 'original', isCurrent: () => true });
  expect(result.error?.status).toBe(401);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a refreshed token for another account cannot replay the original command', async () => {
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://audit.invalid';
  (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: {
    session: { access_token: 'original-token', user: { id: 'original' } },
  }, error: null });
  (supabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({ data: {
    session: { access_token: 'other-token', user: { id: 'other' } },
  }, error: null });
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' });
  const result = await executeCommand('dismiss_notification', { p_notification_key: 'a', p_dismissed_at: 'now' },
    { expectedUserId: 'original', isCurrent: () => true });
  expect(result.error?.status).toBe(401);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('account change during a retry delay stops the retry', async () => {
  jest.useFakeTimers();
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://audit.invalid';
  let current = true;
  (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: {
    session: { access_token: 'original-token', user: { id: 'original' } },
  }, error: null });
  global.fetch = jest.fn().mockImplementation(async () => {
    current = false;
    return { ok: false, status: 503, text: async () => '' };
  });
  const result = executeCommand('dismiss_notification', { p_notification_key: 'a', p_dismissed_at: 'now' },
    { expectedUserId: 'original', isCurrent: () => current });
  await jest.advanceTimersByTimeAsync(250);
  expect((await result).error?.status).toBe(401);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([true, false])('attention receipts handle HTTP 504 with the existing idempotent retry (recovery=%s)', async recover => {
  jest.useFakeTimers();
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://audit.invalid';
  const unavailable = { ok: false, status: 504, text: async () => 'Gateway Timeout' };
  global.fetch = jest.fn().mockResolvedValueOnce(unavailable).mockResolvedValue(
    recover ? { ok: true, status: 200, text: async () => JSON.stringify({ recorded: 1 }) } : unavailable,
  );
  const pending = executeCommand('mark_notification_attention_seen', {
    p_receipts: [{ scope_kind: 'daily_event', scope_id: 'local-event', seen_at: '2026-09-28T14:23:00Z' }],
  });
  await jest.advanceTimersByTimeAsync(250);
  const result = await pending;
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(calls[0][1].body).toBe(calls[1][1].body);
  if (recover) {
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ recorded: 1 });
    expect(reportApiFailure).not.toHaveBeenCalled();
  } else {
    expect(result.error).toMatchObject({ status: 504, code: 'DOJI_COMMAND_ERROR' });
    expect(reportApiFailure).toHaveBeenCalledTimes(1);
  }
  expect(jest.getTimerCount()).toBe(0);
});
