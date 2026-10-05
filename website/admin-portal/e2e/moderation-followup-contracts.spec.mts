import type { Page } from "@playwright/test";
import { expect, test } from '../../coverage-fixture.mts';
import {
  installMockBackend,
  seedAdminSession,
  operatorSession,
  reportCase,
  reportId,
} from './fixtures.mts';

const reason = 'Reviewed the additional context and verified the appropriate case outcome.';
const decision = {
  id: '77777777-7777-4777-8777-777777777777',
  state: 'active',
  action: 'remove_content',
  policy_code: 'restricted_goods',
  severity: 'level_2',
};
const history = (action:string, occurred_at:string) => ({ action, occurred_at });
const reopened = history('report.reopened', '2026-09-29T12:00:00Z');

async function openCase(page: Page, patch = {}, session = operatorSession) {
  await seedAdminSession(page, true);
  const detail = { ...structuredClone(reportCase), ...patch };
  const requests = await installMockBackend(page, {
    employeeMode: true,
    reportCase: detail,
    session,
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.locator('.portalNav [data-view="moderation"]').click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Case context');
  return { requests, detail };
}

const followups = [
  {
    name: 'dismissed case',
    patch: { status: 'dismissed', triage_state: { report_status: 'dismissed' } },
    action: 'reopen_case',
  },
  {
    name: 'actioned case with status fallback',
    patch: { status: 'actioned', triage_state: null },
    action: 'reopen_case',
  },
  {
    name: 'restricted actioned case',
    patch: {
      status: 'actioned',
      queue: 'restricted_safety',
      triage_state: { queue: 'restricted_safety', report_status: 'actioned' },
    },
    action: 'reopen_case',
  },
  { name: 'pending follow-up', patch: { workflow_history: [reopened] }, action: 'reclose_case' },
  {
    name: 'new follow-up after previous closure',
    patch: { workflow_history: [reopened, history('report.reclosed', '2026-09-28T12:00:00Z')] },
    action: 'reclose_case',
  },
  {
    name: 'restricted follow-up',
    patch: {
      queue: 'restricted_safety',
      triage_state: { queue: 'restricted_safety', report_status: 'pending' },
      workflow_history: [reopened],
    },
    action: 'reclose_case',
  },
];

for (const { name, patch, action } of followups) {
  test(`${name}: confirmation preserves enforcement and writes only review state`, async ({
    page,
  }) => {
    const { requests } = await openCase(page, { decision_summary: decision, ...patch });
    const button = page.locator(`[data-admin-decision="${action}"]`);
    await expect(button).toBeVisible();
    await expect(page.locator('#moderationClassification')).toBeHidden();
    await button.click();
    await expect(page.locator('#decisionError')).toContainText(
      'review reason of at least 10 characters',
    );
    await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
    await page.locator('#decisionReason').fill(reason);
    await button.click();
    await expect(page.locator('#moderationConfirmSummary')).toContainText('Unchanged');
    await expect(page.locator('#moderationConfirmCopy')).toContainText('unchanged');
    expect(requests.filter((r) => r.path.endsWith('/report-review-state'))).toHaveLength(0);
    await page.locator('#moderationConfirmSubmit').click();
    await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
    const writes = requests.filter((r) => r.path.endsWith('/report-review-state'));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.body!)).toEqual({
      reportId,
      action: action === 'reopen_case' ? 'reopen' : 'reclose',
      reason,
      idempotencyKey: expect.any(String),
    });
    expect(requests.filter((r) => r.path.endsWith('/report-decision'))).toHaveLength(0);
  });
}

const ineligible:[string,Record<string,unknown>][] = [
  ['missing decision', { decision_summary: null }],
  ['reversed decision', { decision_summary: { ...decision, state: 'reversed' } }],
  [
    'quarantine is not a final decision',
    { decision_summary: { ...decision, action: 'quarantine' } },
  ],
  ['pending appeal', { decision_summary: { ...decision, appeal_status: 'pending' } }],
  ['unsupported archived status', { status: 'closed', triage_state: { report_status: 'closed' } }],
  ['no reopening history', { status: 'pending', workflow_history: [] }],
  ['missing history', { status: 'pending', workflow_history: null }],
  [
    'reclosed after reopening',
    {
      status: 'pending',
      workflow_history: [reopened, history('report.reclosed', '2026-09-30T12:00:00Z')],
    },
  ],
  [
    'equal reopening and closure timestamps',
    {
      status: 'pending',
      workflow_history: [reopened, history('report.reclosed', reopened.occurred_at)],
    },
  ],
];
for (const [name, patch] of ineligible) {
  test(`follow-up is unavailable: ${name}`, async ({ page }) => {
    const { requests } = await openCase(page, {
      status: 'actioned',
      triage_state: null,
      decision_summary: decision,
      ...patch,
    });
    await expect(page.locator('[data-admin-decision="reopen_case"]')).toHaveCount(0);
    await expect(page.locator('[data-admin-decision="reclose_case"]')).toHaveCount(0);
    expect(requests.filter((r) => r.path.endsWith('/report-review-state'))).toHaveLength(0);
  });
}

for (const restricted of [false, true]) {
  test(`${restricted ? 'restricted' : 'ordinary'} follow-up requires its own write capability`, async ({
    page,
  }) => {
    const session = {
      ...operatorSession,
      capabilities: {
        ...operatorSession.capabilities,
        [restricted ? 'restricted_review' : 'moderation_write']: false,
      },
    };
    await openCase(
      page,
      {
        status: 'actioned',
        decision_summary: decision,
        triage_state: {
          report_status: 'actioned',
          queue: restricted ? 'restricted_safety' : 'moderation',
        },
      },
      session,
    );
    await expect(page.locator('[data-admin-decision="reopen_case"]')).toHaveCount(0);
    await expect(page.locator('#decisionPanel')).toBeHidden();
  });
}

test('failed follow-up retries the same intent; editing the rationale starts a new intent', async ({
  page,
}) => {
  await openCase(page, { status: 'actioned', triage_state: null, decision_summary: decision });
  const bodies:Record<string,unknown>[] = [];
  await page.route('**/portal/admin/report-review-state', (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'Review state temporarily unavailable' } });
  });
  await page.locator('#decisionReason').fill(reason);
  await page.locator('[data-admin-decision="reopen_case"]').click();
  await page.locator('#moderationConfirmSubmit').click();
  await expect(page.locator('#moderationConfirmError')).toHaveText(
    'Review state temporarily unavailable',
  );
  await page.locator('#moderationConfirmSubmit').click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await page.getByRole('button', { name: 'Cancel decision', exact: true }).click();
  await page.locator('#decisionReason').fill(`${reason} Additional review requested.`);
  await page.locator('[data-admin-decision="reopen_case"]').click();
  await page.locator('#moderationConfirmSubmit').click();
  await expect.poll(() => bodies.length).toBe(3);
  expect(bodies[2]!.idempotencyKey).not.toBe(bodies[0]!.idempotencyKey);
});

for (const action of ['claim', 'release', 'priority']) {
  test(`successful ${action} refreshes the case and sends one atomic triage command`, async ({
    page,
  }) => {
    const patch =
      action === 'release' ? { assigned_to: operatorSession.user_id, owner: 'Gavin Fahey' } : {};
    const { requests, detail } = await openCase(page, patch);
    const refreshed = {
      ...detail,
      assigned_to: action === 'claim' ? operatorSession.user_id : null,
      priority: action === 'priority' ? 'high' : 'normal',
    };
    await page.route('**/portal/admin/report-case-v3?*', (route) =>
      route.fulfill({ json: refreshed }),
    );
    if (action === 'priority') {
      await page.locator('#decisionReason').fill(reason);
      await page.locator('#moderationPriority').selectOption('high');
    } else await page.locator('#claimReportButton').click();
    await expect
      .poll(() => requests.filter((r) => r.path.endsWith('/report-triage')).length)
      .toBe(1);
    await expect(page.locator('#claimReportButton')).toBeEnabled();
    const body = JSON.parse(requests.find((r) => r.path.endsWith('/report-triage'))!.body!);
    expect(body).toEqual({
      reportId,
      action: action === 'priority' ? 'set_priority' : action,
      priority: action === 'priority' ? 'high' : null,
      note: action === 'priority' ? reason : null,
      idempotencyKey: expect.any(String),
    });
    if (action === 'claim')
      await expect(page.locator('#claimReportButton')).toHaveText('Release case');
    if (action === 'release')
      await expect(page.locator('#claimReportButton')).toHaveText('Claim case');
    if (action === 'priority')
      await expect(page.locator('#moderationPriority')).toHaveValue('high');
  });
}

test('successful triage followed by failed refresh blocks further decisions instead of inviting resubmission', async ({
  page,
}) => {
  const { requests } = await openCase(page);
  await page.route('**/portal/admin/command-center?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Refresh unavailable' } }),
  );
  await page.locator('#claimReportButton').click();
  await expect(page.locator('#decisionError')).toContainText('case update was saved');
  await expect(page.locator('#claimReportButton')).toBeDisabled();
  await expect(page.locator('#moderationPriority')).toBeDisabled();
  await expect(page.locator('#drawerActions')).toBeEmpty();
  expect(requests.filter((r) => r.path.endsWith('/report-triage'))).toHaveLength(1);
});
