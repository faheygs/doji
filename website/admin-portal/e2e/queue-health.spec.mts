import { expect, test } from '../../coverage-fixture.mts';
import { commandCenter, installMockBackend, seedAdminSession } from './fixtures.mts';
import { present } from '../../test-values.mts';

for (const priority of ['normal', 'critical']) {
  test(`queue card marks 24h-late ${priority} work as overdue`, async ({ page }) => {
    const row = {
      ...present(commandCenter.work_items[0]),
      priority,
      deadline_at: new Date(Date.now() - 86400000).toISOString(),
    };
    await seedAdminSession(page);
    const requests = await installMockBackend(page, {
      commandCenter: {
        ...commandCenter,
        work_items: [row],
        queue_health: [
          {
            key: 'moderation',
            label: 'Trust & safety',
            count: 1,
            note: '1 nearing the 24-hour target',
          },
        ],
      },
    });
    await page.goto('/');
    const card = page.locator('#queueHealth [data-queue-health="moderation"]');
    await expect(card).toContainText('1 overdue');
    await expect(card).toContainText('24h');
    await expect(card).not.toContainText('nearing');
    await expect(card).toHaveAttribute(
      'data-tone',
      priority === 'critical' ? 'critical' : 'overdue',
    );
    await expect(page.locator('#priorityQueue')).toContainText(
      priority === 'critical' ? 'Urgent review overdue' : 'Review target missed',
    );
    await expect(page.locator('#urgentMetric').locator('..')).toContainText('or already overdue');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await expect(card.locator('small')).toHaveCSS(
        'color',
        theme === 'light' ? 'rgb(169, 34, 54)' : 'rgb(255, 173, 186)',
      );
    }
    expect(
      requests.filter((r) => r.method === 'POST' && !r.path.endsWith('/realtime-token')),
    ).toHaveLength(0);
  });
}

test('partial queue does not show an all-clear and within-target queue is green only when complete', async ({
  page,
}) => {
  await seedAdminSession(page);
  await installMockBackend(page, {
    commandCenter: {
      ...commandCenter,
      work_items: [present(commandCenter.work_items[0])],
      queue_health: [
        {
          key: 'moderation',
          label: 'Trust & safety',
          count: 80,
          note: 'All inside the internal target',
        },
      ],
    },
  });
  await page.goto('/');
  const card = page.locator('#queueHealth [data-queue-health="moderation"]');
  await expect(card).toHaveAttribute('data-tone', 'unknown');
  await expect(card).toContainText('1 loaded of 80');
  await expect(card).not.toContainText('All inside');
});
