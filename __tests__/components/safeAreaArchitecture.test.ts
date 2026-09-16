import fs from 'node:fs';
import path from 'node:path';
import { getBottomTabBarMetrics, TAB_SCREEN_SAFE_AREA_EDGES } from '../../lib/safeAreaLayout';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(resolved);
    return /\.(ts|tsx)$/.test(entry.name) ? [resolved] : [];
  });
}

describe('cross-platform safe areas', () => {
  it('does not use React Native SafeAreaView, which only applies iOS insets', () => {
    const offenders = ['app', 'components']
      .flatMap((directory) => sourceFiles(path.join(process.cwd(), directory)))
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from ['"]react-native['"];/s.test(source);
      })
      .map((file) => path.relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  it('assigns the native bottom inset to the tab bar exactly once', () => {
    expect(getBottomTabBarMetrics('android', 24)).toEqual({
      height: 76,
      paddingBottom: 24,
      paddingTop: 8,
    });
    expect(getBottomTabBarMetrics('android', 0)).toEqual({
      height: 52,
      paddingBottom: 0,
      paddingTop: 8,
    });
    expect(getBottomTabBarMetrics('ios', 34)).toEqual({
      height: 86,
      paddingBottom: 34,
      paddingTop: 8,
    });
    expect(getBottomTabBarMetrics('web', 34)).toEqual({
      height: 52,
      paddingBottom: 0,
      paddingTop: 8,
    });
  });

  it('keeps the bottom inset out of every screen hosted by the tab navigator', () => {
    expect(TAB_SCREEN_SAFE_AREA_EDGES).toEqual(['top', 'left', 'right']);

    const tabScreens = sourceFiles(path.join(process.cwd(), 'app', '(app)'));
    for (const file of tabScreens) {
      const source = fs.readFileSync(file, 'utf8');
      const safeAreaTags = source.match(/<SafeAreaView\b[^>]*>/gs) ?? [];
      for (const tag of safeAreaTags) {
        expect(tag).toContain('edges={TAB_SCREEN_SAFE_AREA_EDGES}');
      }
    }
  });
});
