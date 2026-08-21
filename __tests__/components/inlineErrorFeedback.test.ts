import fs from 'node:fs';
import path from 'node:path';

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

function sourceFiles(root: string): string[] {
  return fs.readdirSync(path.join(process.cwd(), root), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

describe('contextual error feedback contract', () => {
  it('keeps corrective errors on their current surface instead of a global toast', () => {
    const offenders = ['app', 'components', 'hooks']
      .flatMap(sourceFiles)
      .filter((file) => /Toast\.show\(\s*\{[\s\S]{0,240}?type:\s*['"]error['"]/.test(source(file)));

    expect(offenders).toEqual([]);
  });

  it('announces persistent inline failures accessibly', () => {
    const feedback = source('components/ui/InlineFeedback.tsx');
    expect(feedback).toContain("accessibilityRole={tone === 'error' ? 'alert' : undefined}");
    expect(feedback).toContain("accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}");
    expect(feedback).toContain('announceForAccessibility');
  });

  it.each([
    'app/(auth)/login.tsx',
    'app/(auth)/username.tsx',
    'app/(app)/camera.tsx',
    'app/(app)/format.tsx',
    'app/(app)/poll.tsx',
    'app/(app)/profile/edit.tsx',
    'app/(app)/suggest-challenge.tsx',
    'app/(app)/task.tsx',
    'components/feed/PostCommentsThread.tsx',
    'components/feed/ReportSheet.tsx',
    'components/settings/ChangePasswordSheet.tsx',
  ])('%s renders failures in context', (file) => {
    expect(source(file)).toContain('<InlineFeedback');
  });
});
