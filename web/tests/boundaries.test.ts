// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
describe('web and member isolation', () => {
  it('keeps web source outside Expo compilation, Jest discovery and EAS uploads', () => {
    const config = JSON.parse(read('../../tsconfig.json'));
    const root = JSON.parse(read('../../package.json'));
    expect(config.exclude).toContain('web');
    expect(root.jest.testPathIgnorePatterns).toContain('<rootDir>/web/');
    expect(root.jest.modulePathIgnorePatterns).toContain('<rootDir>/web/');
    const upload = read('../../.easignore').split(/\r?\n/);
    expect(upload).toContain('/*');
    expect(upload.some((line) => line.startsWith('!/web'))).toBe(false);
    for (const dependency of ['@mui/material', 'next', 'vite', 'react-router-dom'])
      expect(root.dependencies[dependency]).toBeUndefined();
  });
  it('does not install paid MUI components or a second socket system', () => {
    const lock = JSON.parse(read('../package-lock.json'));
    const packages = Object.keys(lock.packages);
    expect(packages.some((name) => /(?:socket\.io|@mui\/.*-(?:pro|premium))/.test(name))).toBe(
      false,
    );
    expect(packages.some((name) => /(?:@supabase\/|@workos-inc\/)/.test(name))).toBe(false);
  });
});
