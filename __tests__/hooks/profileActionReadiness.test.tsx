import { renderHook } from '@testing-library/react-native';
import { useProfileActionReadiness } from '../../hooks/useProfileActionReadiness';

const fresh = { isStale: false, isFetchedAfterMount: false, isError: false };
const stale = { ...fresh, isStale: true };
const fetched = { ...stale, isFetchedAfterMount: true };

test('fresh entry stays ready when cache ages without polling', () => {
  const hook = renderHook(
    ({ read }: { read: typeof fresh }) => useProfileActionReadiness('alice', read, read),
    { initialProps: { read: fresh } },
  );
  expect(hook.result.current).toBe(true);
  hook.rerender({ read: stale });
  expect(hook.result.current).toBe(true);
});

test('stale entry waits for both successful action reads', () => {
  const hook = renderHook(
    ({ relationship, block }: { relationship: typeof fresh; block: typeof fresh }) =>
      useProfileActionReadiness('alice', relationship, block),
    { initialProps: { relationship: stale, block: stale } },
  );
  expect(hook.result.current).toBe(false);
  hook.rerender({ relationship: fetched, block: stale });
  expect(hook.result.current).toBe(false);
  hook.rerender({ relationship: fetched, block: { ...fetched, isError: true } });
  expect(hook.result.current).toBe(false);
  hook.rerender({ relationship: fetched, block: fetched });
  expect(hook.result.current).toBe(true);
});

test('new target requires its own entry readiness', () => {
  const hook = renderHook(
    ({ target, read }: { target: string | undefined; read: typeof fresh }) =>
      useProfileActionReadiness(target, read, read),
    { initialProps: { target: undefined as string | undefined, read: fresh } },
  );
  hook.rerender({ target: 'alice', read: fresh });
  expect(hook.result.current).toBe(true);
  hook.rerender({ target: 'bob', read: stale });
  expect(hook.result.current).toBe(false);
  hook.rerender({ target: 'bob', read: fetched });
  expect(hook.result.current).toBe(true);
});
