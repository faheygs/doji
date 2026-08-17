import fs from 'node:fs';
import path from 'node:path';

describe('app theme host', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/system/AppThemeHost.tsx'),
    'utf8',
  );

  it('keeps navigation and native transition surfaces on the selected theme', () => {
    expect(source).toContain('NavigationThemeProvider');
    expect(source).toContain("Appearance.setColorScheme(isDark ? 'dark' : 'light')");
    expect(source).toContain('SystemUI.setBackgroundColorAsync(colors.background)');
    expect(source).toContain('background: colors.background');
  });

  it('allows both native interface styles in Expo configuration', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8'));
    expect(config.expo.userInterfaceStyle).toBe('automatic');
  });
});
