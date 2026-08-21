import fs from 'node:fs';
import path from 'node:path';

describe('comments keyboard layout', () => {
  it('shrinks the sheet viewport instead of padding below the composer', () => {
    const sheet = fs.readFileSync(
      path.join(process.cwd(), 'components/feed/PostCommentsSheet.tsx'),
      'utf8',
    );
    const thread = fs.readFileSync(
      path.join(process.cwd(), 'components/feed/PostCommentsThread.tsx'),
      'utf8',
    );

    expect(sheet).toContain('<AppKeyboardViewport');
    expect(sheet).toContain('<AppKeyboardToolbar />');
    expect(sheet).not.toContain('insidePageSheet');
    expect(thread).not.toContain('keyboardInset');
  });
});
