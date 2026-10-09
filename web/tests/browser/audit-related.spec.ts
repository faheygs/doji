import { expect, test } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import { auditFixture } from '../audit-fixture';
import { reportFixture, reportId, moderatorId } from '../moderation-fixture';

for (const restricted of [false, true])
  test(
    'audit related case reauthorizes and respects restricted evidence: ' + restricted,
    async ({ page, request }) => {
      const f = await installBusinessFixture(page, request);
      const report = reportFixture();
      report.status = 'resolved';
      if (restricted) report.triage_state.queue = 'restricted_safety';
      const reads: string[] = [];
      await page.route('**/api/session', (route) =>
        route.fulfill({
          json: {
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: {
              user_id: moderatorId,
              capabilities: { operations_read: true, moderation_read: true, legal_read: false },
            },
          },
        }),
      );
      await page.route('**/api/rpc', (route) => {
        const { name } = route.request().postDataJSON() as { name: string };
        reads.push(name);
        if (name === 'get_admin_audit_page_v2') {
          const data = auditFixture(1);
          data.items[0]!.entity_type = 'report';
          data.items[0]!.entity_id = reportId;
          return route.fulfill({ json: data });
        }
        if (name === 'get_admin_report_case_v3') return route.fulfill({ json: report });
        return route.fallback();
      });
      await page.goto('https://admin.dojipro.com/connected.html#/audit');
      await page.getByRole('cell', { name: 'Synthetic review 1' }).click();
      expect(reads).not.toContain('get_admin_report_case_v3');
      await page.getByRole('link', { name: 'Open related case' }).click();
      if (restricted) {
        await expect(page.getByRole('button', { name: 'Retry case read' })).toBeVisible();
        await expect(page.getByText('Current synthetic caption', { exact: true })).toHaveCount(0);
      } else
        await expect(page.getByText('Current synthetic caption', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Back to audit log' }).click();
      await expect(page.getByRole('cell', { name: 'Synthetic review 1' })).toBeVisible();
      expect(reads.filter((name) => name.startsWith('admin_'))).toHaveLength(0);
      expect(f.external).toEqual([]);
    },
  );
