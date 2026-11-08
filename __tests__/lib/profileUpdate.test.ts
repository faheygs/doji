import { createProfileUpdater } from '../../lib/profileUpdate';
import { executeCommand } from '../../lib/commandGateway';
import { filterContent } from '../../lib/contentFilter';
import type { Profile } from '../../types/database';

jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/contentFilter', () => ({ filterContent: jest.fn() }));
const command = jest.mocked(executeCommand);
const profile = { id: 'member-a', bio: 'confirmed' } as Profile;
const failure = (code = 'DOJI_COMMAND_TIMEOUT') => ({ code, message: 'synthetic', details: null, hint: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  let userId: string | undefined = 'member-a';
  const state = jest.fn(), confirmed = jest.fn();
  const updater = createProfileUpdater({ userId: () => userId, state, confirmed });
  return { updater, state, confirmed, switchTo: (id?: string) => { userId = id; updater.reset(); } };
}
beforeEach(() => {
  jest.resetAllMocks();
  command.mockResolvedValue({ data: profile, error: null });
  jest.mocked(filterContent).mockReturnValue({ ok: true });
});

test('copies and freezes nested intent and reuses exact key only on explicit retry', async () => {
  const f = fixture();
  const patch = { notification_preferences: { push_enabled: true } } as Partial<Profile>;
  command.mockResolvedValueOnce({ data: null, error: failure() });
  const first = f.updater.update(patch);
  patch.notification_preferences!.push_enabled = false;
  await expect(first).rejects.toMatchObject({ code: 'DOJI_COMMAND_TIMEOUT' });
  const args = command.mock.calls[0][1];
  expect(args).toMatchObject({ p_patch: { notification_preferences: { push_enabled: true } } });
  expect(Object.isFrozen((args as { p_patch: unknown }).p_patch)).toBe(true);
  expect(f.state).toHaveBeenLastCalledWith('uncertain');
  await expect(f.updater.update({ bio: 'replacement' })).rejects.toThrow('Retry the previous');
  expect(command).toHaveBeenCalledTimes(1);
  await f.updater.retry();
  expect(command.mock.calls[1][1]).toEqual(args);
  expect(command.mock.calls[1][2]?.expectedUserId).toBe('member-a');
  expect(f.confirmed).toHaveBeenCalledTimes(1);
  expect(f.state).toHaveBeenLastCalledWith('idle');
});

test('concurrent retry taps share one transport and new saves cannot race it', async () => {
  const f = fixture(), pending = deferred<{ data: Profile; error: null }>();
  command.mockReturnValueOnce(pending.promise);
  const first = f.updater.update({ avatar_url: 'https://synthetic.test/member-a/avatar.jpg' });
  expect(f.updater.retry()).toBe(first);
  await expect(f.updater.update({ bio: 'other' })).rejects.toThrow('Retry the previous');
  pending.resolve({ data: profile, error: null });
  await first;
  expect(command).toHaveBeenCalledTimes(1);
  await expect(f.updater.retry()).rejects.toThrow('no profile save');
});

test.each(['P0001', '23505', '23514', '22023', '42501'])('definitive atomic SQL rejection %s permits a corrected new intent', async (code) => {
  const f = fixture();
  command.mockResolvedValueOnce({ data: null, error: failure(code) });
  await expect(f.updater.update({ bio: 'rejected' })).rejects.toMatchObject({ code });
  expect(f.state).toHaveBeenLastCalledWith('idle');
  await f.updater.update({ bio: 'corrected' });
  expect(command.mock.calls[0][1]).not.toEqual(command.mock.calls[1][1]);
});

test.each(['thrown', 'empty', 'wrong-member'] as const)('unconfirmed %s response retains intent', async (kind) => {
  const f = fixture();
  if (kind === 'thrown') command.mockRejectedValueOnce(Error('lost response'));
  else command.mockResolvedValueOnce({ data: kind === 'empty' ? null : { ...profile, id: 'member-b' }, error: null });
  await expect(f.updater.update({ bio: null })).rejects.toThrow();
  expect(f.confirmed).not.toHaveBeenCalled();
  expect(f.state).toHaveBeenLastCalledWith('uncertain');
  await f.updater.retry();
  expect(command.mock.calls[0][1]).toEqual(command.mock.calls[1][1]);
});

test.each(['before-send', 'after-send'] as const)('A→B→A invalidates the original lifetime %s', async (when) => {
  const f = fixture(), pending = deferred<{ data: Profile; error: null }>();
  const account = f.updater.capture();
  command.mockReturnValueOnce(pending.promise);
  const first = f.updater.update({ bio: 'old account lifetime' });
  if (when === 'after-send') await Promise.resolve();
  f.switchTo('member-b'); f.switchTo('member-a');
  expect(account.isCurrent()).toBe(false);
  pending.resolve({ data: profile, error: null });
  await expect(first).rejects.toThrow('account changed');
  expect(f.confirmed).not.toHaveBeenCalled();
  expect(f.state).toHaveBeenLastCalledWith('idle');
  await expect(f.updater.retry()).rejects.toThrow('no profile save');
  if (when === 'after-send') expect(command.mock.calls[0][2]?.isCurrent()).toBe(false);
  else expect(command).not.toHaveBeenCalled();
});

test('late old result cannot clear a new account pending save', async () => {
  const f = fixture(), old = deferred<{ data: Profile; error: null }>();
  command.mockReturnValueOnce(old.promise);
  const first = f.updater.update({ bio: 'old' });
  const rejection = expect(first).rejects.toThrow('account changed');
  await Promise.resolve(); f.switchTo('member-b');
  command.mockResolvedValueOnce({ data: null, error: failure() });
  await expect(f.updater.update({ bio: 'new' })).rejects.toMatchObject({ code: 'DOJI_COMMAND_TIMEOUT' });
  old.resolve({ data: profile, error: null });
  await rejection;
  command.mockResolvedValueOnce({ data: { ...profile, id: 'member-b' }, error: null });
  await f.updater.retry();
  expect(command.mock.calls[2][1]).toEqual(command.mock.calls[1][1]);
});

test('signed-out and filtered input never send or retain a command', async () => {
  const f = fixture();
  f.switchTo();
  await expect(f.updater.update({ bio: 'test' })).rejects.toThrow('Not authenticated');
  f.switchTo('member-a');
  jest.mocked(filterContent).mockReturnValue({ ok: false, reason: 'Blocked' });
  await expect(f.updater.update({ username: 'blocked' })).rejects.toThrow('Blocked');
  expect(command).not.toHaveBeenCalled();
  await expect(f.updater.retry()).rejects.toThrow('no profile save');
});
