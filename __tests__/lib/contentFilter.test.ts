import { filterContent } from '../../lib/contentFilter';

describe('filterContent', () => {
  it('accepts normal social content', () => {
    expect(filterContent('Best snack for a road trip?')).toEqual({ ok: true });
  });

  it('rejects profanity at word boundaries', () => {
    expect(filterContent('this is fucking awful').ok).toBe(false);
  });

  it('rejects spaced and leet evasions', () => {
    expect(filterContent('n 1 g g 3 r').ok).toBe(false);
  });

  it('does not reject innocent substring matches', () => {
    expect(filterContent('A classic Nigerian recipe')).toEqual({ ok: true });
    expect(filterContent('This class is specific')).toEqual({ ok: true });
  });
});
