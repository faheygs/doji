jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn(), withScope: jest.fn() }));
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  Object.defineProperty(native.Platform, 'OS', { configurable: true, value: 'ios' });
  return native;
});
import { QueryClient } from '@tanstack/react-query';
import { createApiQueryCache } from '../../lib/apiQueryCache';
import { setDiagnosticActor, submissionOutcomeSnapshot, mobileDiagnosticSnapshot, recordAvatarUploadOutcome, takeWorkflowOutcomeCounts } from '../../lib/mobileDiagnosticContext';

test('avatar observations are fixed-category, account-fenced and detached only once', () => {
  setDiagnosticActor('avatar-account-A');
  const session = mobileDiagnosticSnapshot().session_id;
  recordAvatarUploadOutcome('started', session); recordAvatarUploadOutcome('confirmed', session);
  const counts = takeWorkflowOutcomeCounts();
  expect(counts.map(row => row.outcome)).toEqual(['started','confirmed']);
  expect(counts.every(row => row.phase === 'avatar_upload')).toBe(true);
  expect(takeWorkflowOutcomeCounts()).toEqual([]);
  setDiagnosticActor('avatar-account-B'); recordAvatarUploadOutcome('request_failed', session);
  expect(takeWorkflowOutcomeCounts()).toEqual([]); setDiagnosticActor(null);
});

test('read attempts count once across retries, retain no query payload, and fence account changes', async () => {
  setDiagnosticActor('synthetic-workflow-A');
  const client = new QueryClient({ queryCache: createApiQueryCache(), defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  try {
    let attempts = 0;
    await client.fetchQuery({ queryKey: ['profile', 'private-id'], retry: 1, retryDelay: 0, queryFn: async () => {
      if (++attempts === 1) throw Error('private-error'); return { private: 'profile-details' };
    } });
    const profile = submissionOutcomeSnapshot().rows.filter(row => row.phase === 'profile_read');
    expect(profile.map(row => [row.outcome, row.count])).toEqual([['started', 1], ['confirmed', 1]]);
    await expect(client.fetchQuery({ queryKey: ['feed', 'private-event'], queryFn: async () => { throw Error('private-feed'); } })).rejects.toThrow();
    expect(submissionOutcomeSnapshot().rows.filter(row => row.phase === 'feed_read').map(row => row.outcome)).toEqual(['started', 'request_failed']);
    let finish!: (value: unknown) => void;
    const pending = client.fetchQuery({ queryKey: ['shop'], queryFn: () => new Promise(resolve => { finish = resolve; }) });
    setDiagnosticActor('synthetic-workflow-B');
    finish({ secret: 'late-old-account' }); await pending;
    expect(submissionOutcomeSnapshot().rows).toEqual([]);
    await client.fetchQuery({ queryKey: ['unknown-private'], queryFn: async () => 'private-result' });
    expect(submissionOutcomeSnapshot().rows).toEqual([]);
    expect(JSON.stringify(submissionOutcomeSnapshot())).not.toMatch(/private|synthetic|secret/);
  } finally { client.clear(); setDiagnosticActor(null); }
});
