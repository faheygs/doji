import { expect, test } from '../../coverage-fixture.mjs';
import {
  commandCenter,
  installMockBackend,
  operatorSession,
  reportCase,
  reportId,
  seedAdminSession,
} from './fixtures.mjs';

const appealId = '99999999-9999-4999-8999-999999999999';
const decisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const auditId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const archivedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const reason = 'An independent review confirms the evidence and the appropriate appeal outcome.';
const appeal = () => ({
  case_contract_version: 1,
  appeal: {
    id: appealId,
    report_id: reportId,
    decision_id: decisionId,
    statement: 'Please review this decision.',
    status: 'pending',
    submitted_at: '2026-09-29T12:00:00Z',
  },
  original_decision: {
    id: decisionId,
    action: 'remove_content',
    state: 'active',
    policy_code: 'restricted_goods',
    severity: 'level_2',
    rationale: 'Original rationale.',
    member_notice: 'Original member notice.',
    account_action: 'warning',
    original_decider_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  },
  original_evidence: { availability: 'content_snapshot_not_retained' },
  report_case: structuredClone(reportCase),
  review_eligibility: { can_review: true },
});

async function start(page, options, configure = async () => {}) {
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, { employeeMode: true, ...options });
  await configure();
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return requests;
}

async function openAppeal(page, detail, session = operatorSession) {
  const row = {
    id: appealId,
    queue: 'safety',
    status: 'appeal',
    subject: 'Member appeal',
    appeal: detail.appeal,
  };
  const requests = await start(page, {
    session,
    commandCenter: { ...commandCenter, work_items: [row] },
    appealCase: detail,
  });
  await page.locator('.portalNav [data-view="safety"]').click();
  await page.locator(`[data-queue-body="safety"] [data-work-id="${appealId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Original member notice.');
  return requests;
}

for (const complete of [true, false]) {
  test(`appeal history renders ${complete ? 'recorded reviewers and times' : 'missing legacy review metadata'} without inventing evidence`, async ({
    page,
  }) => {
    const detail = appeal();
    detail.appeal.status = 'upheld';
    detail.appeal.reviewed_at = complete ? '2026-09-30T12:00:00Z' : 'invalid';
    detail.appeal.reviewed_by = complete ? { display_name: 'Independent reviewer' } : null;
    detail.appeal.review_reason = complete ? '<b>Literal review</b>' : null;
    detail.appeal.submitted_at = complete ? '2026-09-29T12:00:00Z' : null;
    detail.appeal.statement = complete ? 'Original appeal statement' : null;
    detail.original_decision.decided_at = complete ? '2026-09-28T12:00:00Z' : null;
    detail.original_decision.decided_by = complete ? { display_name: 'Original reviewer' } : null;
    detail.original_decision.rationale = complete ? 'Original rationale.' : null;
    detail.original_decision.account_action = complete ? 'temporary_restriction' : null;
    detail.original_decision.decider_deleted = !complete;
    detail.original_decision.restriction_ends_at = complete ? '2026-10-03T12:00:00Z' : null;
    const requests = await openAppeal(page, detail);
    await expect(page.locator('#drawerContent')).toContainText(
      complete ? 'Restriction ends' : 'Deleted operator',
    );
    await page.locator('[data-drawer-tab="history"]').click();
    const history = page.locator('#drawerContent .drawerTimeline').first();
    await expect(history).toContainText('Appeal Upheld');
    await expect(history).toContainText(complete ? 'Independent reviewer' : 'Reviewer unavailable');
    await expect(history).toContainText(
      complete ? '<b>Literal review</b>' : 'Review reason unavailable',
    );
    await expect(history).toContainText(complete ? 'Original rationale.' : 'Rationale unavailable');
    if (!complete) await expect(history).toContainText('Time not recorded');
    await expect(history.locator('b')).toHaveCount(0);
    expect(requests.filter((r) => r.path.endsWith('/appeal-decision'))).toEqual([]);
  });
}

for (const action of ['uphold', 'reverse']) {
  for (const ownDecision of [false, true]) {
    test(`${action} appeal ${ownDecision ? 'with audited super-admin override' : 'by independent reviewer'} sends only an appeal command`, async ({
      page,
    }) => {
      const detail = appeal();
      if (ownDecision) detail.original_decision.original_decider_id = operatorSession.user_id;
      const requests = await openAppeal(page, detail);
      await page.locator('#decisionReason').fill(reason);
      await page.locator(`[data-admin-decision="${action}_appeal"]`).click();
      await expect(page.locator('#moderationConfirmSummary')).toContainText(reason);
      if (ownDecision)
        await expect(page.locator('#moderationConfirmSummary')).toContainText(
          'Super admin override',
        );
      else
        await expect(page.locator('#moderationConfirmSummary')).not.toContainText(
          'Super admin override',
        );
      await expect(page.locator('#moderationClassification')).toBeHidden();
      expect(requests.filter((r) => r.path.endsWith('/appeal-decision'))).toHaveLength(0);
      await page.locator('#moderationConfirmSubmit').click();
      await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
      const writes = requests.filter((r) => r.path.endsWith('/appeal-decision'));
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0].body)).toEqual({
        appealId,
        outcome: action,
        reason,
        idempotencyKey: expect.any(String),
      });
      expect(requests.filter((r) => r.path.endsWith('/report-decision'))).toHaveLength(0);
    });
  }
}

for (const name of [
  'independence',
  'write permission',
  'temporary restriction',
  'permanent ban',
  'closed appeal',
]) {
  test(`appeal decisions fail closed for ${name}`, async ({ page }) => {
    const detail = appeal();
    const session = structuredClone(operatorSession);
    let expected;
    if (name === 'independence') {
      detail.original_decision.original_decider_id = session.user_id;
      session.roles = ['moderator'];
      expected = 'Independent reviewer required';
    } else if (name === 'write permission') {
      session.capabilities.moderation_write = false;
      expected = 'Moderation access required';
    } else if (name === 'closed appeal') {
      detail.review_eligibility = { can_review: false, blocked_reason: 'appeal_closed' };
      expected = 'Appeal cannot be reviewed';
    } else {
      detail.original_decision.account_action =
        name === 'permanent ban' ? 'permanent_ban' : 'temporary_restriction';
      session.capabilities.restricted_review = false;
      expected = 'Restricted reviewer required';
    }
    const requests = await openAppeal(page, detail, session);
    await expect(page.locator('#moderationActionStatus')).toContainText(expected);
    await expect(page.locator('#decisionReasonField')).toBeHidden();
    await expect(page.locator('#drawerActions')).toBeEmpty();
    expect(requests.filter((r) => r.path.endsWith('/appeal-decision'))).toHaveLength(0);
  });
}

async function openAudit(page, entityType, entityId, options = {}, configure) {
  const requests = await start(page, options, async () => {
    await page.route('**/portal/admin/audit?*', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: auditId,
              category: 'decision',
              action: 'report.decision_recorded',
              entity_type: entityType,
              entity_id: entityId,
              occurred_at: '2026-09-29T12:00:00Z',
            },
          ],
          next_cursor: null,
        },
      }),
    );
    await configure?.();
  });
  await page.locator('.portalNav [data-view="audit"]').click();
  await page.locator(`[data-audit-id="${auditId}"]`).click();
  await expect(page.locator('#auditDetailModal')).toHaveAttribute('open', '');
  return requests;
}

test('audit opens a report already loaded in the queue without an archive lookup', async ({
  page,
}) => {
  const requests = await openAudit(page, 'report', reportId, {
    reportCase: {
      ...reportCase,
      evidence: { ...reportCase.evidence, caption: 'Test post caption' },
    },
  });
  await page.getByRole('button', { name: 'Open related case', exact: true }).click();
  await expect(page.locator('#drawerContent')).toContainText('Test post caption');
  await expect(page.locator('#auditDetailModal')).not.toHaveAttribute('open', '');
  expect(requests.filter((r) => r.path.includes('/report-case-v3?'))).toHaveLength(1);
});

for (const rich of [false, true]) {
  test(`audit retrieves an off-queue ${rich ? 'restricted report with metadata' : 'report with absent optional metadata'}`, async ({
    page,
  }) => {
    const detail = {
      ...structuredClone(reportCase),
      id: archivedId,
      evidence: { ...reportCase.evidence, caption: 'Test post caption' },
      status: 'actioned',
      triage_state: rich
        ? { queue: 'restricted_safety', deadline_at: '2026-09-30T12:00:00Z' }
        : null,
    };
    if (rich)
      Object.assign(detail, {
        subject: 'Archived restricted report',
        specific_concern: 'Synthetic concern',
        category: 'Restricted policy',
        summary: 'Synthetic archive summary',
        priority: 'high',
        owner: { display_name: 'Archive reviewer' },
        history: ['Synthetic archive entry'],
      });
    else
      Object.assign(detail, {
        priority: null,
        subject: null,
        category: null,
        summary: null,
        history: null,
      });
    const requests = await openAudit(page, 'report', archivedId, { reportCase: detail });
    await page.getByRole('button', { name: 'Open related case', exact: true }).click();
    await expect(page.locator('#auditDetailModal')).not.toHaveAttribute('open', '');
    await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#drawerContent')).toContainText('Test post caption');
    await expect(page.locator('#drawerHeaderMeta')).toContainText(rich ? 'high' : 'normal');
    expect(requests.filter((r) => r.path.includes('/report-case-v3?'))).toHaveLength(2);
  });
}

for (const entityType of ['report', 'moderation_appeal']) {
  test(`audit ${entityType} read failure stays in the modal and allows an explicit retry`, async ({
    page,
  }) => {
    let attempts = 0;
    const endpoint = entityType === 'report' ? 'report-case-v3' : 'appeal-case';
    await openAudit(page, entityType, archivedId, {}, async () => {
      await page.route(`**/portal/admin/${endpoint}?*`, (route) => {
        attempts++;
        return route.fulfill({ status: 503, json: { error: 'Archive temporarily unavailable' } });
      });
    });
    const button = page.getByRole('button', { name: 'Open related case', exact: true });
    await button.click();
    await expect(page.locator('#auditRelatedError')).toHaveText('Archive temporarily unavailable');
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => attempts).toBe(2);
    await expect(page.locator('#auditRelatedError')).toHaveCount(1);
    await expect(page.locator('#auditDetailModal')).toHaveAttribute('open', '');
    await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
  });
}

test('audit rejects a mismatched appeal identity without displaying its content', async ({
  page,
}) => {
  await openAudit(page, 'moderation_appeal', archivedId, { appealCase: appeal() });
  await page.getByRole('button', { name: 'Open related case', exact: true }).click();
  await expect(page.locator('#auditRelatedError')).toHaveText(
    'The related appeal could not be verified.',
  );
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
});

for (const entityType of ['report', 'moderation_appeal']) {
  test(`late ${entityType} audit read cannot reopen a dismissed modal`, async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const endpoint = entityType === 'report' ? 'report-case-v3' : 'appeal-case';
    await openAudit(page, entityType, archivedId, {}, async () => {
      await page.route(`**/portal/admin/${endpoint}?*`, async (route) => {
        reads++;
        await gate;
        await route.fulfill({
          json: entityType === 'report' ? { ...reportCase, id: archivedId } : appeal(),
        });
      });
    });
    await page.getByRole('button', { name: 'Open related case', exact: true }).click();
    await expect.poll(() => reads).toBe(1);
    await page.locator('#auditDetailModal').getByRole('button', { name: /Close/ }).click();
    const response = page.waitForResponse((r) => r.url().includes(`/portal/admin/${endpoint}?`));
    release();
    await response;
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page.locator('#auditDetailModal')).not.toHaveAttribute('open', '');
    await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#drawerContent')).toBeEmpty();
  });
}
