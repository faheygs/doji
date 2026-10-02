import { test, expect } from '../../coverage-fixture.mjs';
import { seedAdminSession, installMockBackend, reportCase, reportId } from './fixtures.mjs';

async function start(page, detail, configure) {
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, { reportCase: detail, employeeMode: true });
  await configure?.();
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.locator('.portalNav [data-view="moderation"]').click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Case context');
  return requests;
}

for (const [state, label] of [
  ['visible', 'Visible in app'],
  ['quarantined', 'Quarantined from members'],
  ['removed', 'Removed from members'],
  ['banned', 'Account suspended'],
  ['active', 'Account active'],
  ['', 'Pending verification'],
])
  test(`review details show authoritative content state: ${state || 'unknown'}`, async ({
    page,
  }) => {
    const detail = structuredClone(reportCase);
    detail.case_context = { content_state: state };
    detail.reporter = null;
    detail.reported_user = { username: 'synthetic-account', is_banned: state === 'banned' };
    detail.notes = '<img src=x onerror=alert(1)> literal context';
    const requests = await start(page, detail);
    await expect(page.locator('.caseFactsGrid')).toContainText(label);
    await expect(page.locator('#drawerContent')).toContainText(detail.notes);
    await expect(page.locator('#drawerContent img')).toHaveCount(0);
    await expect(page.locator('.moderationPeople')).toContainText('Unavailable');
    await page.locator('[data-drawer-tab="related"]').click();
    await expect(page.locator('#drawerContent')).toContainText('synthetic-account');
    expect(
      requests.filter((request) => request.method === 'POST' && !request.path.includes('token')),
    ).toEqual([]);
  });

for (const [kind, fields, text] of [
  ['post', { caption: 'Literal <post> caption' }, 'Literal <post> caption'],
  ['comment', { body: 'Literal <comment> body' }, 'Literal <comment> body'],
  ['poll_response', { custom_text: 'Literal <poll> answer' }, 'Literal <poll> answer'],
  ['account', {}, 'account-level behavior'],
  ['profile_photo', { has_profile_photo: true }, 'Profile photo attached'],
  ['account_profile', { has_profile_photo: false }, 'No profile photo'],
])
  test(`evidence renderer uses the correct fields for ${kind}`, async ({ page }) => {
    const detail = structuredClone(reportCase);
    detail.target_kind = kind;
    detail.evidence = { kind, exists: false, ...fields };
    await start(page, detail);
    await expect(page.locator('.moderationEvidence')).toContainText(text);
    await expect(page.locator('#drawerContent')).toContainText('Content unavailable');
    await expect(page.locator('.moderationEvidence')).toContainText('no longer available');
    await expect(page.locator('.moderationEvidence img, .moderationEvidence script')).toHaveCount(
      0,
    );
  });

for (const [status, state, label] of [
  ['dismissed', {}, 'Closed — no violation'],
  ['actioned', {}, 'Closed — action taken'],
  ['pending', { queue: 'restricted_safety' }, 'Restricted review'],
  ['pending', { assigned_to: 'synthetic-owner' }, 'In review'],
  ['pending', {}, 'Awaiting assignment'],
])
  test(`workflow history separates triage ${label} from evidence access`, async ({ page }) => {
    const detail = structuredClone(reportCase);
    detail.status = status;
    detail.created_at = '2026-01-01T10:00:00Z';
    detail.triage_state = { report_status: status, ...state };
    detail.workflow_history = [];
    detail.evidence_access = { view_count: 0 };
    await start(page, detail);
    await page.locator('[data-drawer-tab="history"]').click();
    await expect(page.locator('.triageStateCard')).toContainText(label);
    await expect(page.locator('.historyAccessSummary')).toContainText(
      'No authorized evidence access',
    );
    await expect(page.locator('.drawerTimeline')).toContainText('Report received');
    await expect(page.locator('#decisionPanel')).toBeHidden();
  });

test('workflow sorts actions, preserves literal reasons, formats roles and excludes evidence views', async ({
  page,
}) => {
  const detail = structuredClone(reportCase);
  delete detail.workflow_history;
  delete detail.evidence_access;
  detail.created_at = '2026-01-01T10:00:00Z';
  detail.history = [
    { action: 'report.evidence_viewed', occurred_at: '2026-01-01T13:00:00Z' },
    {
      action: 'report.claim',
      occurred_at: '2026-01-01T11:00:00Z',
      actor: { display_name: 'Test reviewer', username: 'reviewer' },
      metadata: { priority: 'high' },
    },
    {
      action: 'report.set_priority',
      occurred_at: '2026-01-01T12:00:00Z',
      actor_role: 'safety_reviewer',
      reason: '<strong>literal rationale</strong>',
      metadata: { priority: 'critical', policyCode: 'restricted_goods', severity: 'level_3' },
    },
    { action: 'report.custom_event', actor: {}, metadata: 'not-an-object' },
  ];
  await start(page, detail);
  await page.locator('[data-drawer-tab="history"]').click();
  const titles = page.locator('.drawerTimeline strong');
  await expect(titles).toHaveText([
    'Priority changed',
    'Case claimed',
    'Report received',
    'Report Custom Event',
  ]);
  await expect(page.locator('.drawerTimeline')).toContainText('Safety Reviewer');
  await expect(page.locator('.drawerTimeline')).toContainText('Priority: Critical');
  await expect(page.locator('.drawerTimeline')).toContainText('Policy: Restricted Goods');
  await expect(page.locator('.drawerTimeline')).toContainText('Severity: Level 3');
  await expect(page.locator('.drawerTimeline')).toContainText('<strong>literal rationale</strong>');
  await expect(page.locator('.drawerTimeline')).toContainText('Test reviewer · @reviewer');
  await expect(page.locator('.historyAccessSummary')).toContainText('Opened 1 time');
  await expect(page.locator('.drawerTimeline')).not.toContainText('Evidence Viewed');
});

test('explicit workflow avoids duplicate received entries and shows bounded access metadata', async ({
  page,
}) => {
  const detail = structuredClone(reportCase);
  detail.workflow_history = [{ action: 'report.received', occurred_at: detail.created_at }];
  detail.evidence_access = {
    view_count: 2,
    last_viewed_at: 'invalid-time',
    last_viewer: { role: 'restricted_reviewer' },
  };
  detail.triage_state = { owner: { display_name: 'Assigned reviewer' }, priority: 'high' };
  await start(page, detail);
  await page.locator('[data-drawer-tab="history"]').click();
  await expect(page.locator('.drawerTimeline strong')).toHaveText(['Report received']);
  await expect(page.locator('.historyAccessSummary')).toContainText('Opened 2 times');
  await expect(page.locator('.historyAccessSummary')).toContainText('Restricted Reviewer');
  await expect(page.locator('.triageStateCard')).toContainText('Assigned reviewer');
});

test('missing history and creation time stay explicitly empty; related totals use safe zero defaults', async ({
  page,
}) => {
  const detail = structuredClone(reportCase);
  delete detail.created_at;
  delete detail.history;
  delete detail.workflow_history;
  detail.related_context = { prior_reports: 3 };
  await start(page, detail);
  await page.locator('[data-drawer-tab="history"]').click();
  await expect(page.locator('.drawerTimeline')).toContainText('No workflow activity');
  await page.locator('[data-drawer-tab="related"]').click();
  await expect(page.locator('.relatedList')).toContainText('Prior reports on this account');
  await expect(page.locator('.relatedList strong')).toContainText([
    'In-app report',
    'Trust & safety',
    'Test Reporter',
    'Test User',
    '3',
    '0',
    '0',
    'Authorized reviewers only',
  ]);
});

for (const [action, accountAction, label] of [
  ['no_violation', null, 'No violation'],
  ['remove_profile_photo', 'warning', 'Profile photo removed'],
  ['remove_content', 'permanent_ban', 'Content removed'],
  ['custom_action', 'temporary_restriction', 'Custom Action'],
])
  test(`final decision summary retains the outcome and delivery uncertainty: ${action}`, async ({
    page,
  }) => {
    const detail = structuredClone(reportCase);
    detail.decision_summary = {
      action,
      account_action: accountAction,
      restriction_ends_at:
        accountAction === 'temporary_restriction' ? '2026-12-01T00:00:00Z' : null,
      decided_at: 'invalid-time',
      decided_by: {},
      appeal_eligible: action === 'remove_content',
    };
    await start(page, detail);
    await expect(page.locator('.decisionSummary')).toContainText(label);
    await expect(page.locator('.decisionSummary')).toContainText('Not recorded');
    await expect(page.locator('.decisionSummary')).toContainText('Not sent');
    await expect(page.locator('.deliveryStatusGrid')).toContainText('Not Requested');
    if (accountAction === 'permanent_ban')
      await expect(page.locator('.decisionSummary')).toContainText('Permanent Suspension');
    if (!accountAction)
      await expect(page.locator('.decisionSummary')).toContainText('No account action');
  });

for (const [availability, text] of [
  ['archive_pending', 'Preservation is not yet verified'],
  ['object_missing', 'no longer available'],
  ['invalid_reference', 'cannot be opened'],
  ['staff_storage_not_authorized', 'Do not use a public URL'],
  ['expired', 'preview expired'],
  ['unknown', 'could not be loaded'],
])
  test(`media access gaps remain explicit without signing: ${availability}`, async ({ page }) => {
    const detail = structuredClone(reportCase);
    detail.media_manifest.items = [
      {
        slot: 'original_profile_photo',
        kind: 'image',
        availability,
        url: 'https://untrusted.invalid/image',
      },
    ];
    const signed = [];
    await start(page, detail, async () => {
      await page.route('**/storage/v1/object/sign/**', (route) => {
        signed.push(route.request().url());
        return route.abort();
      });
    });
    await expect(page.locator('.moderationEvidenceUnavailable')).toContainText(text);
    await expect(page.locator('#drawerContent img')).toHaveCount(0);
    expect(signed).toEqual([]);
  });

test('a failed authorized preview is replaced with explicit recovery guidance', async ({
  page,
}) => {
  const detail = structuredClone(reportCase);
  detail.media_manifest.items = [
    {
      slot: 'photo',
      kind: 'image',
      availability: 'available',
      bucket: 'post-media',
      path: 'synthetic.jpg',
    },
  ];
  await start(page, detail, async () => {
    await page.route('**/storage/v1/object/sign/**', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            json: { signedURL: '/object/sign/post-media/synthetic.jpg?token=synthetic' },
          })
        : route.fulfill({ status: 404, body: '' }),
    );
  });
  await expect(page.locator('#drawerContent')).toContainText(
    'Protected preview could not be displayed',
  );
  await expect(page.locator('#drawerContent img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh evidence', exact: true })).toBeVisible();
});

for (const [phase, desired, label] of [
  ['pending', 'removed', 'Preservation queued'],
  ['archived', 'removed', 'Evidence preserved; removal pending'],
  ['origin_removed', 'removed', 'Origin removed; access checks pending'],
  ['revoked', 'removed', 'Observed media access revoked'],
  ['restored', 'restored', 'Restoration verified'],
  ['needs_attention', 'removed', 'Media verification needs staff attention'],
  ['unknown', 'removed', 'Verification status unavailable'],
  ['archived', 'restored', 'Restoration checks pending'],
])
  test(`preserved evidence phase is shown without inventing successful access: ${phase}/${desired}`, async ({
    page,
  }) => {
    const detail = structuredClone(reportCase);
    detail.current_decision = { id: reportId };
    detail.preserved_media_manifest = {
      source: 'preserved_decision_media',
      decision_id: reportId,
      access_gaps: true,
      items: [{ slot: 'photo', kind: 'image', phase, desired, availability: 'archive_pending' }],
    };
    await start(page, detail);
    await expect(page.locator('.evidenceProvenance')).toContainText(label);
    await expect(page.locator('.evidenceProvenance')).toContainText(
      'not a complete historical content snapshot',
    );
    await expect(page.locator('.evidenceProvenance [role="status"]').first()).toContainText(
      'Keep the removal request open',
    );
    await expect(page.locator('.evidenceProvenance img')).toHaveCount(0);
  });

for (const items of [
  null,
  {},
  Array.from({ length: 4 }, () => ({ slot: 'photo', availability: 'object_missing' })),
]) {
  test(`incomplete or oversized media manifest blocks case decisions: ${JSON.stringify(items)}`, async ({
    page,
  }) => {
    await seedAdminSession(page, true);
    await installMockBackend(page, {
      employeeMode: true,
      reportCase: { ...reportCase, media_manifest: { items } },
    });
    await page.goto('/');
    await expect(page.locator('#portalApp')).toBeVisible();
    await page.locator('.portalNav [data-view="moderation"]').click();
    await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
    await expect(page.locator('#drawerContent [role="alert"]')).toContainText(
      'evidence manifest is incomplete',
    );
    await expect(page.locator('#drawerActions button')).toHaveCount(0);
  });
}

for (const success of [true, false])
  test(`copy case reference ${success ? 'confirms success' : 'shows the exact reference on clipboard denial'}`, async ({
    page,
  }) => {
    await page.addInitScript((success) => {
      window.copiedReferences = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          async writeText(value) {
            window.copiedReferences.push(value);
            if (!success) throw new Error('Synthetic clipboard denial');
          },
        },
      });
    }, success);
    await start(page, structuredClone(reportCase));
    await page.locator('#copyCaseReference').click();
    await expect(page.locator('#copyCaseReference')).toHaveText(
      success ? 'Reference copied' : reportId,
    );
    expect(await page.evaluate(() => window.copiedReferences)).toEqual([reportId]);
  });
