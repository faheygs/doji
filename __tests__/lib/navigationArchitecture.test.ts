import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('protected navigation architecture', () => {
  it('anchors the tab navigator beneath one outer stack', () => {
    const appLayout = source('app/(app)/_layout.tsx');
    expect(appLayout).toContain("anchor: '(tabs)'");
    expect(appLayout).toContain('<Stack');
    expect(appLayout).toContain('<Stack.Screen name="(tabs)"');
  });

  it('registers only stable roots as tabs', () => {
    const tabLayout = source('app/(app)/(tabs)/_layout.tsx');
    expect(tabLayout).toContain('<Tabs');
    for (const name of ['index', 'rank', 'friends', 'suggest-challenge', 'profile']) {
      expect(tabLayout).toContain(`name="${name}"`);
    }
    expect(tabLayout).not.toContain('name="member"');
    expect(tabLayout).not.toContain('name="post"');
    expect(tabLayout).not.toContain('name="notifications"');
  });

  it('keeps detail pages outside the tab route group', () => {
    expect(() => source('app/(app)/member/[username].tsx')).not.toThrow();
    expect(() => source('app/(app)/post/[id]/index.tsx')).not.toThrow();
  });
});
