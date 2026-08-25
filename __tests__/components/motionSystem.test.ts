import fs from 'node:fs';
import path from 'node:path';

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

describe('motion system', () => {
  it('respects the operating-system Reduce Motion preference', () => {
    expect(source('hooks/useModalPresence.ts')).toContain('useReducedMotion()');
    expect(source('components/ui/SkeletonSwap.tsx')).toContain('ReduceMotion.System');
  });

  it('uses one skeleton transition on primary cold-load surfaces', () => {
    for (const file of [
      'app/(app)/index.tsx',
      'app/(app)/rank/index.tsx',
      'app/(app)/friends/index.tsx',
      'app/(app)/friends/add.tsx',
      'app/(app)/profile/shop.tsx',
      'components/notifications/NotificationSheet.tsx',
    ]) {
      expect(source(file)).toContain('<SkeletonSwap');
    }
  });

  it('defers popover actions until its native modal is gone', () => {
    const menu = source('components/profile/ProfileManageMenu.tsx');
    expect(menu).toContain('pendingActionRef.current = action');
    expect(menu).toContain('{open ? <Modal');
    expect(menu).toContain('requestAnimationFrame');
    expect(menu).toContain('useDismissOnRouteBlur');
  });
});
