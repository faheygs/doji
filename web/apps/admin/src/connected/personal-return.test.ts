import { expect, it } from 'vitest';
import { personalReturn } from './personal-return';
it('retains only the personal queue status, never an arbitrary return URL', () => {
  expect(personalReturn(new URLSearchParams('from=audit'), 'my-work')).toBeNull();
  for (const state of ['open', 'completed', 'all']) {
    const params = new URLSearchParams({ from: 'my-work', workState: state });
    expect(personalReturn(params)).toBe('/my-work' + (state === 'open' ? '' : '?state=' + state));
    params.delete('from');
    expect(personalReturn(params, 'my-work')).toBe(
      '/my-work' + (state === 'open' ? '' : '?state=' + state),
    );
    expect(personalReturn(params, 'trust-safety')).toBeNull();
  }
  expect(personalReturn(new URLSearchParams('from=my-work&workState=https://example.com'))).toBe(
    '/my-work',
  );
});
