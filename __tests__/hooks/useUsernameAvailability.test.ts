import { act, renderHook } from '@testing-library/react-native';
import { useUsernameAvailability } from '../../hooks/useUsernameAvailability';

const mockRead = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: () => ({ abortSignal: mockRead }) } }));
beforeEach(() => { jest.useFakeTimers(); mockRead.mockReset(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('deadline leaves checking state with a recoverable error instead of hanging', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockRead.mockImplementation(() => new Promise(() => {}));
  const hook = renderHook(() => useUsernameAvailability('valid_name'));
  expect(hook.result.current.status).toBe('checking');
  await act(async () => { await jest.advanceTimersByTimeAsync(6000); });
  expect(hook.result.current.status).toBe('error');
  expect(hook.result.current.isOkForSubmit).toBe(false);
  expect(mockRead).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('changing to an invalid name cannot be overwritten by a cancelled late success', async () => {
  let finish!: (result: unknown) => void;
  mockRead.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(({ name }) => useUsernameAvailability(name), { initialProps: { name: 'valid_name' } });
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  hook.rerender({ name: '!' });
  await act(async () => { finish({ data: true, error: null, status: 200 }); });
  expect(hook.result.current.status).toBe('invalid');
  expect(hook.result.current.isOkForSubmit).toBe(false);
  hook.unmount();
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });
  expect(jest.getTimerCount()).toBe(0);
});
