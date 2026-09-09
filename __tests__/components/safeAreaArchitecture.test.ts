import fs from 'node:fs';
import path from 'node:path';

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
});
