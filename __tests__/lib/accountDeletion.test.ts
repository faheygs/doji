import { accountDeletionFailure, isAccountDeletionConfirmed } from '../../lib/accountDeletion';

test.each([null, undefined, {}, { ok: false }, { ok: 'true' }])('never assumes an ambiguous deletion succeeded: %j', (value) => {
  expect(isAccountDeletionConfirmed(value)).toBe(false);
});
test('requires an explicit server acknowledgement', () => {
  expect(isAccountDeletionConfirmed({ ok: true })).toBe(true);
});
test('returns a safe support reference without displaying SQL or provider details', async () => {
  const requestId = '11111111-1111-4111-8111-111111111111';
  const result = await accountDeletionFailure({ context: Response.json({ requestId, detail: 'secret SQL', error: 'private email' }, { status: 500 }) });
  expect(result).toEqual({ message: expect.stringContaining('couldn’t confirm'), reference: requestId, status: 500 });
  expect(JSON.stringify(result)).not.toMatch(/secret SQL|private email/);
});
test('expired authentication has a specific recovery instruction', async () => {
  expect((await accountDeletionFailure({ context: Response.json({}, { status: 401 }) })).message).toContain('Sign in again');
});
test('network errors and malformed responses remain unconfirmed, not falsely not-deleted', async () => {
  expect((await accountDeletionFailure(new Error('network'))).message).toContain('couldn’t confirm');
  expect((await accountDeletionFailure({ context: new Response('not JSON', { status: 502 }) })).reference).toBeUndefined();
});
