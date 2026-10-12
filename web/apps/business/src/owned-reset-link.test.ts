import { expect, it, vi } from 'vitest';
import { captureOwnedResetLink } from './owned-reset-link';
const token = 'synthetic-reset-token-123456';
function fixture(suffix = `?mode=reset#token=${token}`, enabled = true) {
  let now = 1000;
  const replaceState = vi.fn();
  const events = new Map<string, () => void>();
  const vault = captureOwnedResetLink(
    {
      location: {
        href: 'https://business.dojipro.com/business-portal/access/' + suffix,
      } as Location,
      history: { replaceState } as unknown as History,
      addEventListener: (name: string, fn: unknown) => {
        events.set(name, fn as () => void);
      },
    },
    enabled,
    () => now,
  );
  return {
    vault,
    replaceState,
    events,
    expire: () => {
      now += 300001;
    },
  };
}
it('scrubs the current history entry and exposes only a one-use memory capability', () => {
  const f = fixture();
  expect(f.replaceState).toHaveBeenCalledExactlyOnceWith(
    null,
    '',
    '/business-portal/access/?mode=reset',
  );
  expect(JSON.stringify(f.vault)).not.toContain(token);
  expect(f.vault.available()).toBe(true);
  expect(f.vault.take()).toBe(token);
  expect(f.vault.take()).toBe('');
  expect(f.vault.available()).toBe(false);
});
it('rejects query tokens, missing, duplicate, oversized, redirect and malformed links but still scrubs them', () => {
  for (const suffix of [
    '?mode=reset',
    `?mode=reset&token=${token}`,
    `?mode=reset#token=${token}&token=${token}`,
    `?mode=reset&mode=signin#token=${token}`,
    `?mode=reset#token=${'a'.repeat(8193)}`,
    `?mode=reset#token=${token}&redirect=https://example.com`,
    `?mode=reset&token=${token}#token=${token}`,
    '?mode=reset#token=short',
    '?mode=reset#token=%00bad',
    `?mode=reset&token=${token}&token=${token}`,
    `?mode=reset&mode=signin&token=${token}`,
    `?mode=reset&token=${'a'.repeat(8193)}`,
    `?mode=reset&token=${token}#secret`,
    `?mode=reset&token=${token}&redirect=https://example.com`,
    '?mode=reset&token=short',
    '?mode=reset&token=%00bad',
  ]) {
    const f = fixture(suffix);
    expect(f.vault.take()).toBe('');
    expect(f.replaceState).toHaveBeenCalledOnce();
  }
});
it('expires, clears on page hide, and never retains a link with the feature disabled', () => {
  const f = fixture();
  f.expire();
  expect(f.vault.available()).toBe(false);
  expect(f.vault.take()).toBe('');
  const g = fixture();
  g.events.get('pagehide')!();
  expect(g.vault.take()).toBe('');
  const h = fixture(undefined, false);
  expect(h.vault.take()).toBe('');
  expect(h.replaceState).toHaveBeenCalledOnce();
});
it('does not rewrite ordinary sign-in navigation', () => {
  const f = fixture('?mode=signin');
  expect(f.replaceState).not.toHaveBeenCalled();
  expect(f.vault.available()).toBe(false);
});
