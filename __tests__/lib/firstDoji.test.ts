import { firstDojiEnabled, readFirstDoji } from '../../lib/firstDoji';
import { supabase } from '../../lib/supabase';
import { runMemberRead } from '../../lib/runMemberRead';
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/runMemberRead', () => ({ runMemberRead: jest.fn() }));
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  jest.clearAllMocks();
});
test('only exact isolated Dev/Staging bindings are enabled; production stays off', () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'development';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://ohrcupagdoilkwhecict.supabase.co';
  delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
  expect(firstDojiEnabled()).toBe(true);
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'staging';
  expect(firstDojiEnabled()).toBe(true);
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'production';
  expect(firstDojiEnabled()).toBe(false);
  delete process.env.EXPO_PUBLIC_RELEASE_CHANNEL;
  expect(firstDojiEnabled()).toBe(false);
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'development';
  process.env.EXPO_PUBLIC_SCALE_READ_URL = 'https://gateway.invalid';
  // This additive read uses the bound Supabase RPC, not the optional scale gateway.
  expect(firstDojiEnabled()).toBe(true);
  delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  expect(firstDojiEnabled()).toBe(false);
  process.env.EXPO_PUBLIC_APP_ENV = 'staging';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://other.invalid';
  expect(firstDojiEnabled()).toBe(false);
});
test('bounded RPC uses only event/audience and validates scope and safe row', async () => {
  const signal = new AbortController().signal;
  const row = {
    daily_event_id: 'event',
    audience: 'everyone',
    completed_at: '2026-11-10T00:00:00Z',
    profile: {
      id: 'one',
      username: 'one',
      display_name: null,
      avatar_url: null,
      equipped_border_key: null,
    },
  };
  const response = { data: row as unknown, error: null };
  jest.mocked(runMemberRead).mockResolvedValue(response);
  await expect(readFirstDoji('event', 'everyone', signal)).resolves.toEqual(row);
  expect(supabase.rpc).toHaveBeenCalledWith('get_first_doji_v1', {
    p_daily_event_id: 'event',
    p_audience: 'everyone',
  });
  for (const bad of [
    undefined,
    {},
    { ...row, audience: 'friends' },
    { ...row, daily_event_id: 'old' },
    { ...row, completed_at: 'bad' },
    { ...row, profile: {} },
  ]) {
    response.data = bad;
    await expect(readFirstDoji('event', 'everyone', signal)).rejects.toThrow(
      'Invalid first Doji response',
    );
  }
  response.data = null;
  await expect(readFirstDoji('event', 'everyone', signal)).resolves.toBeNull();
});
