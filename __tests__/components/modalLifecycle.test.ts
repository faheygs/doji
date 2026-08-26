import fs from 'node:fs';
import path from 'node:path';

const controlledModals = [
  'components/notifications/NotificationSheet.tsx',
  'components/feed/PostCommentsThread.tsx',
  'components/feed/PostCommentsSheet.tsx',
  'components/challenge/ChallengeReveal.tsx',
  'components/challenge/SubmittedOverlay.tsx',
];

const sharedSheetConsumers = [
  'components/ui/KeyboardSafeSheet.tsx',
  'components/profile/ProfileFriendsSheet.tsx',
  'components/reactions/ReactionVotersSheet.tsx',
  'components/feed/CommentLikesSheet.tsx',
];

describe('native modal lifecycle', () => {
  it.each(controlledModals)('%s unmounts immediately so dismissal cannot block touches', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(source).toMatch(/if \(!visible\) return null/);
    expect(source).toMatch(/<Modal[\s\S]{0,300}?visible=\{visible\}/);
  });

  it.each(sharedSheetConsumers)('%s delegates dismissal to the shared sheet host', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/if \(!visible\) return null/);
    expect(source).toContain('<AppSheetModal');
  });

  it('unmounts the shared sheet atomically when it closes', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/ui/AppSheetModal.tsx'),
      'utf8',
    );
    expect(source).toContain('if (!visible) return null');
    expect(source).toContain('visible={visible}');
    expect(source).toContain('useModalPresence(visible)');
  });

  it('defers notification navigation until the page sheet reports dismissal', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/notifications/NotificationSheet.tsx'),
      'utf8',
    );
    expect(source).toContain('wasVisibleRef.current && !visible');
    expect(source).toContain('finishDismiss()');
    expect(source).toContain('pendingActionRef.current = action');
    expect(source).toContain("<SafeAreaView style={styles.flex} edges={['top', 'bottom']}");
  });

  it('dismisses poll voters before presenting the report sheet', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/feed/PollResultCard.tsx'),
      'utf8',
    );
    expect(source).toContain('setVoterVisible(false)');
    expect(source).toContain('setVoterModal(null)');
    expect(source).toContain('pendingReportRef.current =');
    expect(source).toContain('visible={reportVisible}');
  });
});
