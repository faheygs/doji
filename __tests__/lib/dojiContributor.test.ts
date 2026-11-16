import { readDojiContributor } from '../../lib/dojiContributor';
import { supabase } from '../../lib/supabase';
import { runMemberRead } from '../../lib/runMemberRead';
import { isPersistedQueryKey } from '../../lib/queryPersistence';
import { isServerRead } from '../../lib/reconcileQueries';
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/runMemberRead', () => ({ runMemberRead: jest.fn() }));

function respond(data: unknown) {
  const response = { data, error: null };
  jest.mocked(runMemberRead).mockResolvedValue(response);
}

test('uses only the event and projects validated public fields', async () => {
  const profile = {
    id: 'author',
    username: 'author',
    display_name: null,
    avatar_url: null,
    equipped_border_key: null,
  };
  const row = {
    daily_event_id: 'event',
    profile: { ...profile, email: 'never-retain@test.invalid' },
  };
  respond(row);
  const signal = new AbortController().signal;
  await expect(readDojiContributor('event', signal)).resolves.toEqual({
    ...profile,
    display_name: 'author',
  });
  expect(supabase.rpc).toHaveBeenCalledWith('get_doji_contributor_v1', {
    p_daily_event_id: 'event',
  });
  for (const data of [
    undefined,
    {},
    { ...row, daily_event_id: 'other' },
    { ...row, profile: null },
    ...['id', 'username', 'display_name', 'avatar_url', 'equipped_border_key'].map((key) => ({
      ...row,
      profile: { ...profile, [key]: 5 },
    })),
    { ...row, profile: { ...profile, id: '' } },
    { ...row, profile: { ...profile, username: '' } },
  ]) {
    respond(data);
    await expect(readDojiContributor('event', signal)).rejects.toThrow('Invalid Doji contributor');
  }
  respond(null);
  await expect(readDojiContributor('event', signal)).resolves.toBeNull();
  respond({ ...row, profile: { ...profile, display_name: 'Name' } });
  await expect(readDojiContributor('event', signal)).resolves.toEqual({
    ...profile,
    display_name: 'Name',
  });
});

test('attribution is memory-only and included in foreground/reconnect/read suspension', () => {
  expect(isPersistedQueryKey(['dojiContributor', 'event', 'viewer'])).toBe(false);
  expect(isServerRead({ queryKey: ['dojiContributor', 'event', 'viewer'] })).toBe(true);
});
