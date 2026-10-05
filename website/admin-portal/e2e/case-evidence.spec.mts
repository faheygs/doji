import type {MockOptions} from './fixtures.mts';
import type {AppealFixture,ReportFixture} from './fixtures.mts';
import {installInvalidationStub} from '../../test-contracts.mts';
import type { Page } from "@playwright/test";
import { expect, test } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import { commandCenter, installMockBackend, operatorSession, reportCase, reportId, seedAdminSession } from './fixtures.mts';

const appealId = '99999999-9999-4999-8999-999999999999';
const decisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const appealRow = { id: appealId, queue: 'safety', status: 'appeal', subject: 'Member appeal',
  appeal: { id: appealId, report_id: reportId, decision_id: decisionId, statement: 'Incomplete queue statement' } };
const appealCase:AppealFixture = {
  case_contract_version: 1,
  appeal: { id: appealId, report_id: reportId, decision_id: decisionId, statement: 'Please review my original decision.', status: 'pending', submitted_at: new Date().toISOString() },
  original_decision: { id: decisionId, action: 'remove_content', state: 'active', policy_code: 'restricted_goods', severity: 'level_1',
    rationale: 'Original evidence supported a restricted sale.', member_notice: 'Your original removal notice.',
    account_action: 'warning', account_action_state: 'active', original_decider_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    decided_by: { display_name: 'Original reviewer' }, decided_at: new Date().toISOString() },
  original_evidence: { historical_content_snapshot: false, availability: 'content_snapshot_not_retained' },
  report_case: reportCase,
  review_eligibility: { can_review: true, blocked_reason: null, super_admin_override_required: false },
};
const mediaCase:ReportFixture = { ...reportCase, evidence: { ...reportCase.evidence, caption: 'Current caption', has_media: true },
  media_manifest: { ...reportCase.media_manifest, items: [
    { slot: 'photo', kind: 'image', availability: 'available', bucket: 'post-media', path: 'main.jpg' },
    { slot: 'front_photo', kind: 'image', availability: 'available', bucket: 'post-media', path: 'front.jpg' },
    { slot: 'video', kind: 'video', availability: 'available', bucket: 'post-media', path: 'video.mp4' },
  ] } };

async function start(page: Page, options:MockOptions = {}) {
  // Deny anything not explicitly mocked or served from the local test server.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, { ...options, employeeMode: true });
  await installInvalidationStub(page, 'testInvalidate');
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return requests;
}
async function openReport(page: Page) {
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
}
async function openAppeal(page: Page) {
  await page.getByRole('button', { name: /^Restricted safety/ }).click();
  await page.locator(`[data-queue-body="safety"] [data-work-id="${appealId}"]`).click();
}
const appealOptions = (detail = appealCase) => ({ commandCenter: { ...commandCenter, work_items: [appealRow] }, appealCase: detail });

const preservedManifest = { source: 'preserved_decision_media', decision_id: decisionId, historical_snapshot: true,
  complete_content_snapshot: false, items: [{ slot: 'photo', kind: 'image', availability: 'available',
    bucket: 'moderation-evidence', path: `${decisionId}/original` }] };

for (const isAppeal of [false, true]) {
  test(`preserved media uses the existing drawer and exact ${isAppeal ? 'appealed' : 'reported'} decision, expires on time`, async ({ page }, testInfo) => {
    await page.clock.install();
    const appealDetail = structuredClone(appealCase);
    const reportDetail = structuredClone(reportCase);
    if (isAppeal) {
      appealDetail.original_evidence.preserved_media_manifest = structuredClone(preservedManifest);
      // A newer report decision must never be presented as the appealed archive.
      appealDetail.report_case.preserved_media_manifest = { ...preservedManifest, decision_id: reportId, items: [{ ...preservedManifest.items[0], path: `${reportId}/original` }] };
    } else {
      reportDetail.current_decision = { id: decisionId };
      reportDetail.preserved_media_manifest = structuredClone(preservedManifest);
    }
    await start(page, isAppeal ? appealOptions(appealDetail) : { reportCase: reportDetail });
    const signed:string[] = [];
    await page.route('**/storage/v1/object/sign/moderation-evidence/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') {
        signed.push(path);
        return route.fulfill({ json: { signedURL: `${path}?token=synthetic-preserved` } });
      }
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#345849"/></svg>' });
    });
    await (isAppeal ? openAppeal(page) : openReport(page));
    await expect(page.locator('#drawerContent')).toContainText('Preserved decision media');
    await expect(page.getByAltText('Main photo evidence')).toHaveAttribute('src', new RegExp(`${decisionId}/original`));
    expect(signed).toEqual([`/storage/v1/object/sign/moderation-evidence/${decisionId}/original`]);
    await page.getByAltText('Main photo evidence').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`preserved-${isAppeal ? 'appeal' : 'report'}.png`), animations: 'disabled' });
    await page.clock.fastForward(241_000);
    await expect(page.locator('#drawerContent')).toContainText('protected preview expired');
    await expect(page.locator('#drawerContent img[src*="synthetic-preserved"]')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain('synthetic-preserved');
  });
}

test('mismatched preserved decision fails closed without requesting an archive URL', async ({ page }) => {
  const detail = { ...reportCase, current_decision: { id: reportId }, preserved_media_manifest: preservedManifest };
  await start(page, { reportCase: detail });
  const archiveRequests:string[] = [];
  await page.route('**/storage/v1/object/sign/moderation-evidence/**', route => { archiveRequests.push(route.request().url()); return route.abort(); });
  await openReport(page);
  await expect(page.locator('#drawerContent [role="alert"]')).toContainText('could not be loaded');
  await expect(page.locator('#drawerActions [data-admin-decision]')).toHaveCount(0);
  expect(archiveRequests).toEqual([]);
});

test('audit opens the exact appealed decision even outside the loaded work queue', async ({ page }) => {
  await start(page, { commandCenter: { ...commandCenter, work_items: [] }, appealCase });
  await page.route('**/portal/admin/audit?*', route => route.fulfill({ json: { items: [{
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', category: 'access', action: 'appeal.case_viewed',
    entity_type: 'moderation_appeal', entity_id: appealId, occurred_at: new Date().toISOString(),
  }], next_cursor: null } }));
  await page.getByRole('button', { name: 'Audit log', exact: true }).click();
  await page.locator('[data-audit-filter="access"]').click();
  await page.locator('[data-audit-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]').click();
  await page.getByRole('button', { name: 'Open related case', exact: true }).click();
  await expect(page.locator('#drawerContent')).toContainText('Your original removal notice.');
  await expect(page.locator('#drawerContent')).toContainText('Please review my original decision.');
});

test('avatar appeal separates the retained reference from the current photo and clears both on lock', async ({ page }) => {
  const detail = structuredClone(appealCase);
  detail.original_decision.content_kind = 'profile_photo';
  detail.report_case.target_kind = 'profile_photo';
  detail.report_case.evidence = { kind: 'profile_photo', exists: true, has_profile_photo: true };
  detail.report_case.media_manifest.items = [{ slot: 'profile_photo', kind: 'image', availability: 'available', bucket: 'avatars', path: `${reportId}/current.jpg` }];
  detail.original_evidence = { historical_content_snapshot: false, avatar_reference_retained: true, availability: 'available',
    media_manifest: { source: 'original_decision_reference', items: [{ slot: 'original_profile_photo', kind: 'image', availability: 'available', bucket: 'avatars', path: `${reportId}/retained.jpg` }] } };
  await start(page, appealOptions(detail));
  const signedPaths:string[] = [];
  await page.route('**/storage/v1/object/sign/avatars/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      signedPaths.push(path);
      return route.fulfill({ json: { signedURL: `${path}?token=synthetic-avatar` } });
    }
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#345849"/></svg>' });
  });
  await openAppeal(page);
  await expect(page.getByAltText('Original profile photo evidence', { exact: true })).toHaveAttribute('src', /retained\.jpg/);
  await expect(page.getByAltText('Profile photo evidence', { exact: true })).toHaveAttribute('src', /current\.jpg/);
  await expect(page.locator('#drawerContent')).toContainText('not an immutable snapshot');
  expect(signedPaths).toHaveLength(2);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Lock session', exact: true }).click();
  await expect(page.locator('#drawerContent')).toBeEmpty();
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain('synthetic-avatar');
});

for (const width of [1440, 390]) {
  test(`appeal evidence is readable and accessible in both themes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const detail = structuredClone(appealCase);
    detail.original_evidence.preserved_media_manifest = { ...preservedManifest,
      items: [{ ...preservedManifest.items[0], availability: 'archive_pending', path: null }] };
    const requests = await start(page, appealOptions(detail));
    await page.locator(`#priorityQueue [data-work-id="${appealId}"]`).click();
    await expect(page.locator('#drawerContent')).toContainText('Original evidence supported');
    await expect(page.locator('#drawerContent')).toContainText('Preservation is not yet verified');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({ path: testInfo.outputPath(`appeal-${width}-${theme}.png`), animations: 'disabled' });
      const geometry = await page.locator('#caseDrawer').evaluate(element => ({
        left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
        scroll: element.scrollWidth, width: element.clientWidth,
      }));
      expect(geometry.left).toBeGreaterThanOrEqual(-1);
      expect(geometry.right).toBeLessThanOrEqual(width + 1);
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
      const result = await new AxeBuilder({ page }).include('#drawerContent').analyze();
      expect(result.violations.filter(item => ['critical', 'serious'].includes(item.impact || ""))).toEqual([]);
    }
    await page.locator('[data-drawer-tab="history"]').click();
    await expect(page.locator('#drawerContent')).toContainText('Appeal submitted');
    await expect(page.locator('#drawerContent')).toContainText('Please review my original decision.');
    await expect(page.locator('#drawerContent')).toContainText('Original evidence supported a restricted sale.');
    await expect(page.locator('#drawerContent')).toContainText('Linked report workflow');
    expect(requests.some(request => /\/(report-decision|appeal-decision|report-triage)$/.test(request.path))).toBe(false);
  });
}

test('shows both photos and a non-autoplay video; expires and erases signed previews', async ({ page }, testInfo) => {
  await page.clock.install();
  await start(page, { reportCase: mediaCase });
  await page.route('**/storage/v1/object/sign/**', route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') return route.fulfill({ json: { signedURL: `${url.pathname}?token=fixture` } });
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#345849"/></svg>' });
  });
  await openReport(page);
  await expect(page.locator('.moderationEvidenceImage')).toHaveCount(2);
  const video = page.locator('video');
  await expect(video).toHaveAttribute('controls','');
  await expect(video).toHaveAttribute('preload','none');
  await expect(video).not.toHaveAttribute('autoplay');
  await page.screenshot({ path: testInfo.outputPath('media-light.png'), animations: 'disabled' });
  await page.clock.fastForward(241_000);
  await expect(page.locator('#drawerContent')).toContainText('preview expired');
  await expect(page.locator('#drawerContent img, #drawerContent video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
  await expect(page.locator('.moderationEvidenceImage')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#drawerContent')).toBeEmpty();
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain('token=fixture');
});

test('failed and missing media are explicit and never use the legacy public avatar URL', async ({ page }) => {
  const detail = structuredClone(mediaCase);
  detail.media_manifest.items[0]!.availability = 'object_missing';
  detail.media_manifest.items[1] = { slot: 'profile_photo', kind: 'image', availability: 'staff_storage_not_authorized' };
  detail.evidence.profile_photo_url = 'https://private.invalid/do-not-fetch.jpg';
  await start(page, { reportCase: detail });
  await page.route('**/storage/v1/object/sign/**', route => route.fulfill({ status: 403, json: { message: 'Denied' } }));
  await openReport(page);
  await expect(page.locator('#drawerContent')).toContainText('no longer available');
  await expect(page.locator('#drawerContent')).toContainText('Secure staff access');
  await expect(page.locator('#drawerContent')).toContainText('preview could not be loaded');
  await expect(page.locator('#drawerContent img, #drawerContent video')).toHaveCount(0);
});

test('appeal actions wait for authoritative detail and show the original rationale and notice', async ({ page }, testInfo) => {
  await start(page, appealOptions());
  let release!: () => void;
  await page.route('**/portal/admin/appeal-case?*', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    return route.fulfill({ json: appealCase });
  });
  await openAppeal(page);
  await expect(page.getByRole('button', { name: 'Reverse & restore', exact: true })).toHaveCount(0);
  await expect.poll(() => Boolean(release)).toBe(true); release();
  await expect(page.locator('#drawerContent')).toContainText('Original evidence supported');
  await expect(page.locator('#drawerContent')).toContainText('Your original removal notice.');
  await expect(page.locator('#drawerContent')).toContainText('snapshot was not retained');
  await expect(page.getByRole('button', { name: 'Reverse & restore', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('appeal-light.png'), animations: 'disabled' });
});

test('missing appeal service is not treated as complete queue evidence', async ({ page }) => {
  await start(page, appealOptions());
  await page.route('**/portal/admin/appeal-case?*', route => route.fulfill({ status: 503, json: { message: 'Case unavailable' } }));
  await openAppeal(page);
  await expect(page.locator('#drawerContent [role="alert"]')).toContainText('could not be loaded');
  await expect(page.getByRole('button', { name: 'Reverse & restore', exact: true })).toHaveCount(0);
  await expect(page.locator('#decisionReasonField')).toBeHidden();
});

test('account restriction from detail blocks a reviewer even when the queue omitted it', async ({ page }) => {
  const detail = structuredClone(appealCase); detail.original_decision.account_action = 'permanent_ban';
  await start(page, { ...appealOptions(detail), session: { ...operatorSession, roles: ['moderator'], capabilities: { ...operatorSession.capabilities, restricted_review: false } } });
  await openAppeal(page);
  await expect(page.locator('#moderationActionStatus')).toContainText('Restricted reviewer required');
  await expect(page.getByRole('button', { name: 'Reverse & restore', exact: true })).toHaveCount(0);
});

test('case invalidation closes a stale confirmation and rechecks appeal eligibility', async ({ page }) => {
  await start(page, appealOptions()); await openAppeal(page);
  await expect(page.getByRole('button', { name: 'Reverse & restore', exact: true })).toBeVisible();
  await page.locator('#decisionReason').fill('Independent review found insufficient evidence.');
  await page.getByRole('button', { name: 'Reverse & restore', exact: true }).click();
  await expect(page.locator('#moderationConfirmModal')).toHaveAttribute('open','');
  const closed = structuredClone(appealCase); closed.appeal.status='upheld'; closed.review_eligibility={ can_review:false, blocked_reason:'appeal_closed' };
  await page.route('**/portal/admin/appeal-case?*', route => route.fulfill({ json: closed }));
  await page.waitForFunction(() => typeof window.testInvalidate === 'function');
  await page.evaluate(() => window.testInvalidate({ name:'moderation.appeal.reviewed', data:{} }));
  await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open','');
  await expect(page.locator('#moderationActionStatus')).toContainText('Appeal cannot be reviewed');
  await expect(page.getByRole('button', { name: 'Reverse & restore', exact: true })).toHaveCount(0);
});

test('an older read cannot overwrite a reopened case with the same ID', async ({ page }) => {
  await start(page);
  let release!: () => void; let first = true;
  await page.route('**/portal/admin/report-case-v3?*', async route => {
    if (first) { first=false; await new Promise<void>(resolve => { release=resolve; }); return route.fulfill({ json: { ...reportCase, notes:'Obsolete response' } }); }
    return route.fulfill({ json: { ...reportCase, notes:'Fresh response' } });
  });
  await openReport(page); await expect.poll(() => Boolean(release)).toBe(true);
  await page.keyboard.press('Escape'); await openReport(page);
  await expect(page.locator('#drawerContent')).toContainText('Fresh response');
  release();
  await page.waitForTimeout(200);
  await expect(page.locator('#drawerContent')).not.toContainText('Obsolete response');
});
