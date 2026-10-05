import type { Page } from "@playwright/test";
import { expect, test } from '../../coverage-fixture.mts';
import {
  installMockBackend,
  seedAdminSession,
  operatorSession,
  reportCase,
  reportId,
} from './fixtures.mts';

const reason = 'Reviewed the reported evidence and confirmed the applicable policy.';
const notice = 'This content violated our policy. You can appeal this decision in Account Status.';

async function openCase(page: Page, patch = {}, session = operatorSession) {
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, {
    employeeMode: true,
    session,
    reportCase: { ...structuredClone(reportCase), ...patch },
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.locator('.portalNav [data-view="moderation"]').click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Case context');
  return requests;
}

async function classify(page: Page, severity = 'level_2') {
  await page.locator('#decisionReason').fill(reason);
  await page.locator('#moderationPolicy').selectOption('restricted_goods');
  await page.locator('#moderationSeverity').selectOption(severity);
  await page.locator('#moderationUserNotice').fill(notice);
}

const outcomes = [
  { name: 'ordinary content warning', action: 'remove_content', command: 'remove_content' },
  {
    name: 'ordinary avatar warning',
    kind: 'profile_photo',
    action: 'remove_profile_photo',
    command: 'remove_profile_photo',
  },
  {
    name: 'ordinary profile warning',
    kind: 'account_profile',
    action: 'remove_profile_photo',
    command: 'remove_profile_photo',
  },
  {
    name: 'emergency escalation',
    action: 'escalate_restricted',
    command: 'escalate_restricted',
    severity: 'level_3',
  },
  {
    name: 'restricted warning',
    restricted: true,
    action: 'confirm_restricted',
    command: 'remove_content',
    outcome: 'warning',
  },
  {
    name: 'restricted profile photo removal',
    restricted: true,
    kind: 'profile_photo',
    action: 'confirm_restricted',
    command: 'remove_profile_photo',
    outcome: 'warning',
  },
  {
    name: 'restricted account profile removal',
    restricted: true,
    kind: 'account_profile',
    action: 'confirm_restricted',
    command: 'remove_profile_photo',
    outcome: 'warning',
  },
  {
    name: 'one-day restriction',
    restricted: true,
    action: 'confirm_restricted',
    command: 'remove_content',
    outcome: 'temporary_restriction',
    days: '1',
  },
  {
    name: 'seven-day restriction',
    restricted: true,
    action: 'confirm_restricted',
    command: 'remove_content',
    outcome: 'temporary_restriction',
    days: '7',
  },
  {
    name: 'permanent suspension',
    restricted: true,
    action: 'confirm_restricted',
    command: 'remove_content',
    outcome: 'permanent_ban',
  },
];

for (const entry of outcomes) {
  test(`${entry.name}: confirmation and exact command keep content and account consequences distinct`, async ({
    page,
  }) => {
    const requests = await openCase(page, {
      queue: entry.restricted ? 'restricted_safety' : 'moderation',
      evidence: { ...reportCase.evidence, kind: entry.kind || 'post', has_profile_photo: true },
    });
    await classify(page, entry.severity);
    if (entry.restricted) {
      await page.locator('#moderationAccountOutcome').selectOption(entry.outcome);
      if (entry.days) {
        await expect(page.locator('#moderationRestrictionDaysField')).toBeVisible();
        await page.locator('#moderationRestrictionDays').selectOption(entry.days);
      } else await expect(page.locator('#moderationRestrictionDaysField')).toBeHidden();
    }
    await page.locator(`[data-admin-decision="${entry.action}"]`).click();
    await expect(page.locator('#moderationConfirmModal')).toHaveAttribute('open', '');
    await expect(page.locator('#moderationConfirmSummary')).toContainText(reason);
    await expect(page.locator('#moderationConfirmSummary')).toContainText('Classification');
    if (entry.days)
      await expect(page.locator('#moderationConfirmCopy')).toContainText(
        `${entry.days} day${entry.days === '1' ? '' : 's'}`,
      );
    if (entry.outcome === 'permanent_ban')
      await expect(page.locator('#moderationConfirmCopy')).toContainText('without deletion');
    if (entry.outcome === 'warning')
      await expect(page.locator('#moderationConfirmCopy')).toContainText(
        'account will remain active',
      );
    expect(requests.filter((r) => r.path.endsWith('/report-decision'))).toHaveLength(0);
    await page.locator('#moderationConfirmSubmit').click();
    await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
    const writes = requests.filter((r) => r.path.endsWith('/report-decision'));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.body!)).toEqual({
      reportId,
      action: entry.command,
      policyCode: 'restricted_goods',
      severity: entry.severity || 'level_2',
      reason,
      userNotice: notice,
      accountAction: entry.outcome || null,
      restrictionDays: entry.days ? Number(entry.days) : null,
      idempotencyKey: expect.any(String),
    });
  });
}

for (const restricted of [false, true]) {
  test(`${restricted ? 'restricted' : 'ordinary'} dismissal does not inherit selected enforcement settings`, async ({
    page,
  }) => {
    const requests = await openCase(page, {
      queue: restricted ? 'restricted_safety' : 'moderation',
    });
    await classify(page, 'level_3');
    if (restricted) await page.locator('#moderationAccountOutcome').selectOption('permanent_ban');
    await page.locator('[data-admin-decision="no_violation"]').click();
    await expect(page.locator('#moderationConfirmSummary')).not.toContainText('Classification');
    await expect(page.locator('#moderationConfirmSummary')).not.toContainText('Account outcome');
    await page.locator('#moderationConfirmSubmit').click();
    await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
    const writes = requests.filter((r) => r.path.endsWith('/report-decision'));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.body!)).toEqual({
      reportId,
      action: 'no_violation',
      policyCode: 'no_violation',
      severity: 'none',
      reason,
      userNotice: 'We reviewed this report and found no policy violation.',
      accountAction: null,
      restrictionDays: null,
      idempotencyKey: expect.any(String),
    });
  });
}

for (const [name, field, value, error, restricted] of [
  ['missing policy', 'moderationPolicy', '', 'Choose the policy area', false],
  ['missing severity', 'moderationSeverity', '', 'Choose a severity', false],
  ['short member notice', 'moderationUserNotice', 'Too short', 'plain-language notice', false],
  [
    'ordinary emergency removal',
    'moderationSeverity',
    'level_3',
    'quarantined and escalated',
    false,
  ],
  ['restricted low-severity removal', 'moderationSeverity', 'level_1', 'Level 2 or Level 3', true],
] as const) {
  test(`${name} is rejected before opening confirmation or sending commands`, async ({ page }) => {
    const requests = await openCase(page, {
      queue: restricted ? 'restricted_safety' : 'moderation',
    });
    await classify(page);
    if (field === 'moderationUserNotice') await page.locator(`#${field}`).fill(value);
    else await page.locator(`#${field}`).selectOption(value);
    await page
      .locator(`[data-admin-decision="${restricted ? 'confirm_restricted' : 'remove_content'}"]`)
      .click();
    await expect(page.locator('#decisionError')).toContainText(error);
    await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
    expect(requests.filter((r) => r.path.endsWith('/report-decision'))).toHaveLength(0);
  });
}

for (const restricted of [false, true]) {
  for (const [name, evidence, removable] of [
    ['comment', { kind: 'comment', exists: true }, true],
    ['poll response', { kind: 'poll_response', exists: true }, true],
    ['missing post', { kind: 'post', exists: false }, false],
    ['profile without photo', { kind: 'account_profile', has_profile_photo: false }, false],
    ['unsupported target', { kind: 'unknown', exists: true }, false],
  ] as const) {
    test(`${restricted ? 'restricted' : 'ordinary'} ${name} offers only supported actions`, async ({
      page,
    }) => {
      await openCase(page, {
        queue: restricted ? 'restricted_safety' : 'moderation',
        evidence: { ...reportCase.evidence, ...evidence },
      });
      const actions = page.locator('#drawerActions [data-admin-decision]');
      expect(
        await actions.evaluateAll((nodes) => nodes.map((n) => n.dataset.adminDecision)),
      ).toEqual(
        restricted
          ? ['no_violation', ...(removable ? ['confirm_restricted'] : [])]
          : ['no_violation', ...(removable ? ['remove_content'] : []), 'escalate_restricted'],
      );
    });
  }
}

test('another reviewer owns the case: non-supervisor may read but cannot claim or decide', async ({
  page,
}) => {
  await openCase(
    page,
    { assigned_to: '88888888-8888-4888-8888-888888888888', owner: 'Another reviewer' },
    { ...operatorSession, roles: ['moderator'] },
  );
  await expect(page.locator('#claimReportButton')).toBeDisabled();
  await expect(page.locator('#claimReportButton')).toContainText('Assigned to');
  await expect(page.locator('#drawerActions')).toBeEmpty();
});

for (const restricted of [false, true]) {
  test(`${restricted ? 'restricted' : 'ordinary'} case is read-only without its write capability`, async ({
    page,
  }) => {
    await openCase(
      page,
      { queue: restricted ? 'restricted_safety' : 'moderation' },
      {
        ...operatorSession,
        capabilities: {
          ...operatorSession.capabilities,
          [restricted ? 'restricted_review' : 'moderation_write']: false,
        },
      },
    );
    await expect(page.locator('#drawerActions')).toBeEmpty();
    await expect(page.locator('#claimReportButton')).toBeDisabled();
    await expect(page.locator('#moderationPriority')).toBeDisabled();
  });
}
