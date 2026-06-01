import {
  resolveAccentTheme,
  DEFAULT_ACCENT_THEME,
  normalizeAccentTheme,
  isShopAccentTheme,
} from '../../constants/theme';

describe('resolveAccentTheme', () => {
  it('returns default when accent is not owned', () => {
    expect(resolveAccentTheme('neon_blue', [])).toBe(DEFAULT_ACCENT_THEME);
  });

  it('returns owned accent when present in owned list', () => {
    expect(resolveAccentTheme('neon_blue', ['neon_blue'])).toBe('neon_blue');
  });

  it('always allows built-in default without ownership', () => {
    expect(resolveAccentTheme('doji_orange', [])).toBe('doji_orange');
  });

  it('normalizes invalid stored values to default', () => {
    expect(resolveAccentTheme('not-a-theme', ['forest'])).toBe(DEFAULT_ACCENT_THEME);
    expect(normalizeAccentTheme('not-a-theme')).toBe(DEFAULT_ACCENT_THEME);
  });

  it('excludes default from shop accent themes', () => {
    expect(isShopAccentTheme('doji_orange')).toBe(false);
    expect(isShopAccentTheme('neon_blue')).toBe(true);
  });
});
