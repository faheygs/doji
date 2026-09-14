import fs from 'node:fs';
import path from 'node:path';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(resolved);
    return /\.(ts|tsx)$/.test(entry.name) ? [resolved] : [];
  });
}

describe('Android Fabric list safety', () => {
  it('keeps native clipped-subview removal disabled on every FlatList', () => {
    const offenders = ['app', 'components']
      .flatMap((directory) => sourceFiles(path.join(process.cwd(), directory)))
      .flatMap((file) => {
        const source = fs.readFileSync(file, 'utf8');
        const flatLists = source.match(/<FlatList(?=[\s>])/g)?.length ?? 0;
        const safeLists = source.match(/removeClippedSubviews=\{false\}/g)?.length ?? 0;
        return flatLists === safeLists ? [] : [path.relative(process.cwd(), file)];
      });

    expect(offenders).toEqual([]);
  });
});
