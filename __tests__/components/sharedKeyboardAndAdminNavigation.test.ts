import fs from 'node:fs';
import path from 'node:path';

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('shared keyboard and admin navigation contracts', () => {
  it('uses one toolbar configuration across root and sheet surfaces', () => {
    const toolbar = source('components/ui/AppKeyboardToolbar.tsx');
    const safeSheet = source('components/ui/KeyboardSafeSheet.tsx');
    expect(toolbar).not.toContain('insidePageSheet');
    expect(safeSheet).toContain('<AppKeyboardViewport');
    expect(safeSheet).toContain('<AppKeyboardAwareScrollView');
    expect(safeSheet).toContain('<AppKeyboardToolbar owner="overlay" />');
  });

  it('does not ask iOS numeric pads to render a second Done control', () => {
    const input = source('components/ui/Input.tsx');
    expect(input).toContain('NUMERIC_PAD_KEYBOARDS');
    expect(input).toContain("usesNumericPad ? undefined : 'done'");
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
  ])('%s uses the shared full-page keyboard scroll behavior', (file) => {
    expect(source(file)).toContain('<AppKeyboardAwareScrollView');
  });

  it.each(['suggestions', 'reports'])('%s returns to its explicit opening screen', (route) => {
    const screen = source(`app/(app)/admin/${route}.tsx`);
    expect(screen).toContain('goBackToExplicitReturn');
    expect(screen).not.toContain('goBackWithOptionalReturn');
  });

  it.each([
    ['suggestions', 'No suggestions to review'],
    ['reports', 'No reports to review'],
  ])('%s distinguishes a successful empty queue', (route, title) => {
    const screen = source(`app/(app)/admin/${route}.tsx`);
    expect(screen).toContain('<AdminQueueEmptyState');
    expect(screen).toContain(title);
    expect(screen).toContain('coldError');
  });
});
