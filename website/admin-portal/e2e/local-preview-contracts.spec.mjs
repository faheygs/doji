import { test, expect, reloadWithCoverage } from '../../coverage-fixture.mjs';

// Retained local-preview contracts only. This deliberately switches configuration,
// not implementation, and never authenticates or issues a production command.
const stateKey = 'doji-admin-prototype-state-v1';
const campaignKey = 'doji-business-prototype-company-campaigns-v3';
const profileKey = 'doji-business-prototype-profile-v3';
async function openPreview(page, storage = {}) {
  const external = [];
  page.on('request', (request) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname))
      external.push(request.url());
  });
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, storage);
  await page.route('**/admin-app-*.js', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    expect(source).toContain('"mode": "live"');
    await route.fulfill({ response, body: source.replace('"mode": "live"', '"mode": "preview"') });
  });
  await page.goto('/');
  await page.locator('#adminEmail').fill('synthetic@example.test');
  await page.locator('#adminPassword').fill('local-preview-not-a-password');
  await page.locator('#adminSigninForm button[type="submit"]').click();
  await expect(page.locator('#portalApp')).toBeVisible();
  return external;
}
async function findRecord(page, id) {
  await page.keyboard.press('Control+k');
  await page.locator('#globalSearchInput').fill(id);
  await page.locator(`[data-global-work-id="${id}"]`).click();
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'false');
}
const readState = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), stateKey);

test('local legacy histories render structured and missing fields without markup execution', async ({
  page,
}) => {
  await openPreview(page, {
    [stateKey]: JSON.stringify({
      overrides: {
        'SAFE-208': {
          history: [
            {
              action: 'report.claim',
              actor_role: 'moderator',
              reason: '<b>Literal rationale</b>',
              occurred_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
            },
            { action: null },
            { action: 'report.received', reason: '' },
          ],
        },
        'MOD-1042': { history: null },
      },
      audit: [],
      announcements: [],
    }),
  });
  await findRecord(page, 'SAFE-208');
  await page.locator('[data-drawer-tab="history"]').click();
  await expect(page.locator('.drawerTimeline')).toContainText('<b>Literal rationale</b>');
  await expect(page.locator('.drawerTimeline')).toContainText('3h ago');
  await expect(page.locator('.drawerTimeline')).toContainText('1 step earlier');
  await expect(page.locator('.drawerTimeline')).toContainText('2 steps earlier');
  await expect(page.locator('.drawerTimeline b')).toHaveCount(0);
  await page.locator('[data-drawer-tab="related"]').click();
  await expect(page.locator('#drawerContent')).toContainText(
    'Restricted · elevated authorization required',
  );
  await page.keyboard.press('Escape');
  await findRecord(page, 'MOD-1042');
  await page.locator('[data-drawer-tab="history"]').click();
  await expect(page.locator('.drawerTimeline')).toContainText('No audited case activity yet.');
  await page.locator('[data-drawer-tab="related"]').click();
  await expect(page.locator('#drawerContent')).toContainText('0 recorded events');
});

test('local audit search, categories and CSV export preserve literal incomplete historical records', async ({
  page,
}) => {
  const external = await openPreview(page, {
    [stateKey]: JSON.stringify({
      overrides: {},
      announcements: [],
      audit: [
        {
          id: 'LOCAL-AUDIT',
          type: 'system',
          actor: 'System',
          action: 'Synthetic event',
          entity: 'Local example',
          detail: '=literal',
          time: 'Earlier',
          metadata: null,
        },
      ],
    }),
  });
  await page.locator('.portalNav [data-view="audit"]').click();
  await page.locator('[data-audit-id="LOCAL-AUDIT"]').click();
  await expect(page.locator('#auditDetailBody')).toContainText('Synthetic event');
  await expect(page.locator('#auditDetailActions')).toBeEmpty();
  await page.keyboard.press('Escape');
  await page.locator('#auditSearch').fill('not-in-any-record');
  await expect(page.locator('#auditList')).toContainText('No audit events');
  await page.locator('#auditSearch').fill('Synthetic event');
  await expect(page.locator('#auditList [data-audit-id]')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.locator('[data-action="export-audit"]').click();
  const file = await download;
  const stream = await file.createReadStream();
  let csv = '';
  for await (const chunk of stream) csv += chunk;
  expect(csv).toContain("'=literal");
  expect(csv).toContain('LOCAL-AUDIT');
  expect(external).toEqual([]);
});

for (const [id, action, label] of [
  ['SUG-223', 'approve', 'Accepted'],
  ['SUG-223', 'reject', 'Declined'],
  ['BIZ-041', 'approve', 'Verified'],
  ['BIZ-041', 'revision', 'Information requested'],
  ['BIZ-041', 'reject', 'Declined'],
  ['DOJI-101-A', 'approve', 'Scheduled'],
  ['DOJI-101-A', 'revision', 'Changes requested'],
  ['DOJI-101-A', 'reject', 'Declined'],
  ['SAFE-208', 'resolve', 'Resolved'],
  ['SAFE-208', 'escalate', 'Escalated'],
  ['SAFE-208', 'revision', 'Changes requested'],
  ['MOD-1042', 'restore', 'Restored'],
  ['MOD-1042', 'resolve', 'Resolved'],
  ['MOD-1042', 'escalate', 'Escalated'],
]) {
  test(`local preview ${id} ${action} records only its exact local outcome`, async ({ page }) => {
    const external = await openPreview(page, { 'synthetic-member-session': 'leave-alone' });
    await findRecord(page, id);
    await expect(page.locator('#drawerContent')).toContainText('No production actions are taken.');
    const actionButton = page.locator(`[data-admin-decision="${action}"]`);
    if (['revision', 'reject', 'resolve', 'escalate'].includes(action)) {
      await actionButton.click();
      await expect(page.locator('#toast')).toContainText('Add an internal decision note');
      expect(await readState(page)).toBeNull();
      await expect(page.locator('#decisionReason')).toBeFocused();
    }
    await page.locator('#decisionReason').fill('Synthetic review <b>literal rationale</b>');
    await actionButton.click();
    await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
    const state = await readState(page);
    expect(Object.keys(state.overrides)).toEqual([id]);
    expect(state.overrides[id]).toMatchObject({ label, owner: 'Demo operator' });
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0]).toMatchObject({
      action: label,
      detail: 'Synthetic review <b>literal rationale</b>',
    });
    await findRecord(page, id);
    await page.locator('[data-drawer-tab="history"]').click();
    await expect(page.locator('#drawerContent')).toContainText(
      'Synthetic review <b>literal rationale</b>',
    );
    await expect(page.locator('#drawerContent b')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('synthetic-member-session'))).toBe(
      'leave-alone',
    );
    expect(external).toEqual([]);
  });
}

for (const [action, status, label] of [
  ['approve', 'approved', 'Scheduled'],
  ['revision', 'review', 'Changes requested'],
  ['reject', 'rejected', 'Declined'],
]) {
  test(`local sponsored ${action} updates only the selected draft, with no server request`, async ({
    page,
  }) => {
    const selected = {
      id: 'LOCAL-ONE',
      name: 'Synthetic sponsored question',
      format: 'Poll',
      status: 'review',
      options: ['One', '<img src=x>'],
      destination: 'https://example.test/info',
    };
    const untouched = {
      id: 'LOCAL-TWO',
      name: 'Other draft',
      format: 'Photo idea',
      status: 'draft',
    };
    const external = await openPreview(page, {
      [profileKey]: JSON.stringify({ companyName: 'Synthetic Co', markets: ['Test region'] }),
      [campaignKey]: JSON.stringify([
        { id: 'LOCAL-CAM', name: 'Synthetic campaign', dojis: [selected, untouched] },
      ]),
    });
    await findRecord(page, selected.id);
    await expect(page.locator('#drawerContent')).toContainText('Synthetic Co · Synthetic campaign');
    await expect(page.locator('#drawerContent')).toContainText('<img src=x>');
    await expect(page.locator('#drawerContent img')).toHaveCount(0);
    await page.locator('#decisionReason').fill('Synthetic campaign review only.');
    await page.locator(`[data-admin-decision="${action}"]`).click();
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), campaignKey);
    expect(stored[0].dojis[0]).toEqual({ ...selected, status, label });
    expect(stored[0].dojis[1]).toEqual(untouched);
    expect(external).toEqual([]);
  });
}

test('local campaign states map consistently and seed duplicates are suppressed', async ({
  page,
}) => {
  const states = [
    { id: 'LOCAL-APPROVED', status: 'approved' },
    { id: 'LOCAL-COMPLETE', status: 'completed' },
    { id: 'LOCAL-REVISION', status: 'review', label: 'Changes requested' },
    { id: 'LOCAL-REVIEW', status: 'review' },
    { id: 'LOCAL-DRAFT', status: 'draft' },
    { id: 'DOJI-102-A', status: 'review' },
  ];
  await openPreview(page, {
    [campaignKey]: JSON.stringify([
      {
        id: 'CAM',
        name: 'Synthetic campaign',
        dojis: states.map((s) => ({ ...s, name: s.id, format: 'Poll' })),
      },
      { id: 'EMPTY' },
    ]),
  });
  await page.locator('.portalNav [data-view="campaigns"]').click();
  const rows = page.locator('[data-queue-body="campaigns"]');
  await expect(rows.locator('[data-work-id="DOJI-102-A"]')).toHaveCount(1);
  for (const [id, expected] of [
    ['LOCAL-APPROVED', 'Draft'],
    ['LOCAL-COMPLETE', 'Draft'],
    ['LOCAL-REVISION', 'Changes requested'],
    ['LOCAL-REVIEW', 'In review'],
    ['LOCAL-DRAFT', 'Draft'],
  ]) {
    // Missing labels follow the retained preview fallback, not a production status contract.
    await expect(rows.locator(`[data-work-id="${id}"]`)).toContainText(expected);
  }
});

test('local claim chooses highest priority unassigned work then includes it in My work', async ({
  page,
}) => {
  await openPreview(page);
  await page.locator('.portalNav [data-view="inbox"]').click();
  await page.locator('[data-action="claim-next"]').click();
  await expect(page.locator('#drawerTitle')).toContainText('Profile-photo appeal');
  expect((await readState(page)).overrides['SAFE-207'].owner).toBe('Demo operator');
  await page.locator('[data-action="close-drawer"]').click();
  await page.locator('.portalNav [data-view="inbox"]').click();
  await page.locator('[data-queue-filters="inbox"] [data-queue-filter="mine"]').click();
  await expect(page.locator('[data-queue-body="inbox"] [data-work-id="SAFE-207"]')).toBeVisible();
});

test('local search has empty results, bounded suggestions, and keyboard-accessible drawer tabs', async ({
  page,
}) => {
  await openPreview(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#globalSearchInput')).toBeFocused();
  expect(await page.locator('[data-global-work-id]').count()).toBeLessThanOrEqual(5);
  await page.locator('#globalSearchInput').fill('not-a-real-record');
  await expect(page.locator('#globalSearchResults')).toContainText('No matching work found.');
  await page.locator('#globalSearchInput').fill('MOD-1042');
  await page.locator('[data-global-work-id="MOD-1042"]').click();
  const details = page.locator('[data-drawer-tab="details"]');
  await details.focus();
  await details.press('ArrowLeft');
  await expect(page.locator('[data-drawer-tab="related"]')).toBeFocused();
  await expect(page.locator('#drawerContent')).toContainText('Authorized reviewers only');
  await page.keyboard.press('Home');
  await expect(details).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#drawerContent')).toContainText('Reporter-only hide applied');
  await page.keyboard.press('End');
  await expect(page.locator('[data-drawer-tab="related"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
});

test('local businesses use profile fallbacks and storage reconciliation without mixing account keys', async ({
  page,
}) => {
  await openPreview(page, {
    [profileKey]: JSON.stringify({
      companyName: '<script>Synthetic</script>',
      country: 'Test country',
    }),
  });
  await page.locator('.portalNav [data-view="businesses"]').click();
  const business = page.locator('[data-business-id="BIZ-LOCAL"]');
  await expect(business).toContainText('<script>Synthetic</script>');
  await expect(business).toContainText('Not provided');
  await expect(business).toContainText('Workspace owner');
  await business.click();
  await expect(page.locator('#drawerContent')).toContainText('Business verification record');
  await page.keyboard.press('Escape');
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        companyName: 'Updated synthetic',
        legalName: 'Updated LLC',
        ownerName: 'Tester',
        industry: 'Testing',
        website: 'https://example.test',
        markets: ['One', 'Two'],
      }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, profileKey);
  await expect(business).toContainText('Updated synthetic');
  await expect(business).toContainText('example.test');
  await page.locator('[data-business-id="BIZ-012"]').click();
  await expect(page.locator('#drawerContent')).toContainText('Verified');
});

test('invalid stored preview JSON falls back safely and exiting never clears member storage', async ({
  page,
}) => {
  await openPreview(page, {
    [stateKey]: '{',
    [profileKey]: '{',
    [campaignKey]: '{',
    'synthetic-member-session': 'preserve',
  });
  await page.locator('.portalNav [data-view="moderation"]').click();
  await expect(page.locator('[data-work-id="MOD-1042"]').filter({ visible: true })).toBeVisible();
  await page.locator('[data-action="exit-demo"]').click();
  await expect(page.locator('#portalAuth')).toBeVisible();
  await expect(page.locator('#portalApp')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('synthetic-member-session'))).toBe(
    'preserve',
  );
});

test('local mobile navigation closes through backdrop, close button and Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  for (const close of ['backdrop', 'button', 'escape']) {
    await page.locator('#mobileMenu').click();
    await expect(page.locator('#mobileMenu')).toHaveAttribute('aria-expanded', 'true');
    if (close === 'backdrop')
      await page.locator('#portalSidebarBackdrop').click({ position: { x: 380, y: 400 } });
    if (close === 'button') await page.locator('#sidebarClose').click();
    if (close === 'escape') await page.keyboard.press('Escape');
    await expect(page.locator('#mobileMenu')).toHaveAttribute('aria-expanded', 'false');
  }
});

test('local decision survives a reload without making a production sign-in request', async ({
  page,
}) => {
  const external = await openPreview(page);
  await findRecord(page, 'SUG-223');
  await page.locator('[data-admin-decision="approve"]').click();
  await reloadWithCoverage(page);
  await page.locator('#adminEmail').fill('synthetic@example.test');
  await page.locator('#adminPassword').fill('local-preview-not-a-password');
  await page.locator('#adminSigninForm button[type="submit"]').click();
  await expect(page.locator('#portalApp')).toBeVisible();
  await findRecord(page, 'SUG-223');
  await expect(page.locator('#drawerContent')).toContainText('Accepted');
  expect((await readState(page)).audit).toHaveLength(1);
  expect(external).toEqual([]);
});

test('retained preview announcements remain read-only and escape local draft text', async ({
  page,
}) => {
  const initial = {
    overrides: {},
    audit: [],
    announcements: [
      {
        id: 'LOCAL-ANN',
        title: '<b>Synthetic draft</b>',
        type: 'Service notice',
        audience: 'Synthetic audience',
        frequency: 'Once',
        window: 'Not scheduled',
        status: 'revision',
        label: 'Draft',
      },
    ],
  };
  const external = await openPreview(page, { [stateKey]: JSON.stringify(initial) });
  await page.locator('.portalNav [data-view="announcements"]').click();
  await expect(page.locator('[data-action="new-announcement"]')).toHaveCount(0);
  await expect(page.locator('#announcementModal')).toBeHidden();
  await expect(page.locator('#announcementList')).toContainText('<b>Synthetic draft</b>');
  await expect(page.locator('#announcementList b')).toHaveCount(0);
  expect(await readState(page)).toEqual(initial);
  expect(external).toEqual([]);
});

test('local claim stops when every eligible record is assigned', async ({ page }) => {
  const ids = [
    'SAFE-208',
    'SAFE-207',
    'MOD-1042',
    'MOD-1041',
    'MOD-1038',
    'SUG-223',
    'SUG-222',
    'SUG-220',
    'BIZ-041',
    'DOJI-102-A',
    'DOJI-101-A',
    'DOJI-099-A',
  ];
  const initial = {
    overrides: Object.fromEntries(ids.map((id) => [id, { owner: 'Synthetic reviewer' }])),
    announcements: [],
    audit: [],
  };
  await openPreview(page, { [stateKey]: JSON.stringify(initial) });
  await page.locator('.portalNav [data-view="inbox"]').click();
  await page.locator('[data-action="claim-next"]').click();
  await expect(page.locator('#toast')).toContainText(
    'There is no unassigned work in the current prototype',
  );
  expect(await readState(page)).toEqual(initial);
});
