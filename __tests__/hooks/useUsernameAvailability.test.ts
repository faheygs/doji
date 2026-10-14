import { act, renderHook } from '@testing-library/react-native';
import { useUsernameAvailability } from '../../hooks/useUsernameAvailability';

const mockRead = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
beforeEach(() => {
  jest.useFakeTimers();
  mockRead.mockReset();
  mockRpc.mockReset().mockReturnValue({ abortSignal: mockRead });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('checks a normalized handle without rewriting the editable input', async () => {
  mockRead.mockResolvedValue({ data: true, error: null, status: 200 });
  const hook = renderHook(({ name }: { name: string }) => useUsernameAvailability(name), {
    initialProps: { name: ' @Ja_Ne ' },
  });
  expect(hook.result.current.normalized).toBe('ja_ne');
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  expect(mockRpc).toHaveBeenCalledWith('is_username_available', { p_username: 'ja_ne' });
  expect(hook.result.current.isOkForSubmit).toBe(true);
  hook.rerender({ name: ' @Ja-Ne ' });
  expect(hook.result.current.status).toBe('invalid');
  expect(hook.result.current.isOkForSubmit).toBe(false);
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  expect(mockRpc).toHaveBeenCalledTimes(1);
  hook.unmount();
});

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
  const hook = renderHook(({ name }: { name: string }) => useUsernameAvailability(name), { initialProps: { name: 'valid_name' } });
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });
  hook.rerender({ name: '!' });
  await act(async () => { finish({ data: true, error: null, status: 200 }); });
  expect(hook.result.current.status).toBe('invalid');
  expect(hook.result.current.isOkForSubmit).toBe(false);
  hook.unmount();
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });
  expect(jest.getTimerCount()).toBe(0);
});
