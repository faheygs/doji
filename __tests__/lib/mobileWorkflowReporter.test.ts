import { createMobileWorkflowReporter } from '../../lib/mobileWorkflowReporter';
import { SubmissionOutcomeCounts } from '../../lib/submissionOutcomeCounts';
const now = 1793760000000;
const base = () => ({
  enabled: true,
  environment: 'staging',
  url: 'https://ohrcupagdoilkwhecict.supabase.co',
  now: () => now,
  id: () => 'wf:synthetic-batch-0001',
  current: () => ({ session: 'one', token: 'private-member-token', platform: 'ios' as const }),
  take: () => [
    { phase: 'feed_read' as const, outcome: 'confirmed' as const, count: 2, capped: false },
  ],
  fetch: jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response(null, { status: 204 })),
});
test('drain collapses fixed categories once and leaves new observations separate', () => {
  const counts = new SubmissionOutcomeCounts();
  counts.record('avatar_upload', 'started', now - 60000);
  counts.record('avatar_upload', 'started', now);
  expect(counts.drain(now)).toEqual([
    { phase: 'avatar_upload', outcome: 'started', count: 2, capped: false },
  ]);
  expect(counts.drain(now)).toEqual([]);
  counts.record('submit', 'confirmed', now);
  expect(counts.snapshot(now).rows).toHaveLength(1);
});
test('default-off/mixed environment/member absence never drains or sends', async () => {
  for (const patch of [
    { enabled: false },
    { environment: 'unknown' },
    { url: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
    { current: () => null },
  ]) {
    const deps = { ...base(), ...patch, take: jest.fn(() => []) };
    await createMobileWorkflowReporter(deps).foreground();
    expect(deps.take).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  }
});
test('fixed payload, no body read, no automatic replay and fifteen-minute admission', async () => {
  const deps = base();
  let time = now;
  deps.now = () => time;
  const reporter = createMobileWorkflowReporter(deps);
  await reporter.foreground();
  await reporter.foreground();
  expect(deps.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = deps.fetch.mock.calls[0]!;
  expect(url).toBe(`${deps.url}/functions/v1/mobile-workflow-report`);
  expect(init?.redirect).toBe('error');
  expect(init?.headers).toEqual({
    authorization: 'Bearer private-member-token',
    'content-type': 'application/json',
  });
  expect(JSON.parse(String(init?.body))).toEqual({
    id: deps.id(),
    issuedAt: now,
    platform: 'ios',
    rows: deps.take(),
  });
  time += 900000;
  deps.fetch.mockRejectedValue(Error('private upstream error'));
  await reporter.foreground();
  await reporter.foreground();
  expect(deps.fetch).toHaveBeenCalledTimes(2);
  reporter.dispose();
  time += 900000;
  await reporter.foreground();
  expect(deps.fetch).toHaveBeenCalledTimes(2);
});
test('actor switch before transport fences detached payload and hung fetch cannot block future work', async () => {
  const deps = base();
  let reads = 0;
  deps.current = () => ({ session: ++reads === 1 ? 'one' : 'two', token: 'new', platform: 'ios' });
  await createMobileWorkflowReporter(deps).foreground();
  expect(deps.fetch).not.toHaveBeenCalled();
  jest.useFakeTimers();
  try {
    const stalled = base();
    stalled.fetch.mockImplementation(() => new Promise(() => {}));
    const reporter = createMobileWorkflowReporter(stalled);
    const pending = reporter.foreground();
    await Promise.resolve();
    await reporter.foreground();
    expect(stalled.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    await pending;
    expect(stalled.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
