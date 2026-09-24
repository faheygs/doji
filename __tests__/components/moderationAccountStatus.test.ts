import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('member moderation experience', () => {
  it('exposes Account Status through settings and preserves navigation origin', () => {
    const settings = source('app/(app)/profile/settings.tsx');
    expect(settings).toContain('label="Account status"');
    expect(settings).toContain("hrefWithReturnTo('/(app)/profile/account-status', navigationOrigin)");
  });

  it('shows current standing plus the complete decision history', () => {
    const accountStatus = source('app/(app)/profile/account-status.tsx');
    expect(accountStatus).toContain('No active policy issues');
    expect(accountStatus).toContain('Decision history');
    expect(accountStatus).toContain('decisions.map((decision) =>');
    expect(accountStatus).toContain("decision.state === 'active' && decision.appeal_eligible");
  });

  it('acknowledges a moderation notice and opens Account Status', () => {
    const notifications = source('components/notifications/NotificationSheet.tsx');
    expect(notifications).toContain("case 'moderation_notice'");
    expect(notifications).toContain("executeCommand('mark_moderation_notice_read'");
    expect(notifications).toContain("hrefWithReturnTo('/(app)/profile/account-status', navigationOrigin)");
  });

  it('submits appeals only through the atomic command gateway', () => {
    const hook = source('hooks/useModerationStatus.ts');
    expect(hook).toContain("executeCommand('submit_moderation_appeal'");
    expect(hook).toContain("newCommandId('moderation-appeal')");
    expect(hook).not.toContain("supabase.from('moderation_appeals')");
  });
});
