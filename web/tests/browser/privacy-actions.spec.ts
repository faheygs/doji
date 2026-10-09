import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { privacyActor, privacyId } from '../privacy-fixture';
import { installPrivacyFixture, privacyUrl } from './privacy-fixture';
async function fixture(page: Page, request: APIRequestContext) {
  const f = await installPrivacyFixture(page, request);
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  let uncertain = false,
    reject = false,
    failedRead = false;
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as (typeof writes)[number];
    if (failedRead && call.name === 'get_admin_business_privacy_case_v1')
      return route.fulfill({ status: 503, json: { message: 'Read unavailable' } });
    if (
      !['admin_business_privacy_command_v1', 'admin_case_ownership_command_v1'].includes(call.name)
    )
      return route.fallback();
    writes.push(call);
    if (reject) {
      reject = false;
      return route.fulfill({ status: 409, json: { message: 'Case changed' } });
    }
    let result: Record<string, unknown>;
    if (call.name === 'admin_case_ownership_command_v1') {
      const target = call.args.p_action === 'claim' ? privacyActor : null;
      Object.assign(f.owner, {
        assigned_to: target,
        owner_label: target ? 'Privacy reviewer' : 'Unassigned',
        revision: Number(call.args.p_revision) + 1,
        can_claim: !target,
        can_release: !!target,
      });
      result = {
        kind: 'business_privacy',
        id: privacyId,
        revision: Number(call.args.p_revision) + 1,
        assigned_to: target,
        replayed: writes.length > 1,
      };
    } else {
      const state =
        call.args.p_action === 'complete'
          ? 'completed'
          : call.args.p_action === 'deny'
            ? 'denied'
            : call.args.p_action === 'prepare_erasure'
              ? 'prepared'
              : f.data.state;
      Object.assign(f.data, { state, revision: Number(call.args.p_revision) + 1 });
      Object.assign(f.owner, {
        actionable: !['completed', 'denied'].includes(state),
        can_decide: !['completed', 'denied'].includes(state),
      });
      result = { id: privacyId, revision: Number(call.args.p_revision) + 1, state };
    }
    if (uncertain) {
      uncertain = false;
      return route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
    }
    return route.fulfill({ json: result });
  });
  return {
    ...f,
    writes,
    unknown: () => {
      uncertain = true;
    },
    reject: () => {
      reject = true;
    },
    failReads: () => {
      failedRead = true;
    },
  };
}
async function prepare(page: Page, label = 'Complete request') {
  await page.getByRole('combobox', { name: 'Action', exact: true }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page.getByRole('textbox', { name: 'Protected evidence reference' }).fill('support-ref-001');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
test('start review claims with no outcome fields and release uses the actual ownership revision', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  Object.assign(f.owner, {
    assigned_to: null,
    owner_label: 'Unassigned',
    revision: 0,
    can_claim: true,
    can_release: false,
  });
  await page.goto(privacyUrl + '/' + privacyId);
  await expect(page.getByRole('textbox', { name: 'Protected evidence reference' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start review' }).dblclick();
  await expect(page.getByText('Privacy reviewer (you)', { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.args).toMatchObject({
    p_action: 'claim',
    p_revision: 0,
    p_source_version: '32',
  });
  expect(f.writes[0]!.args).not.toHaveProperty('p_reference');
  await page.getByRole('button', { name: 'Release assignment' }).click();
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();
  expect(f.writes[1]!.args).toMatchObject({ p_action: 'release', p_revision: 1 });
});
test('confirmed completion has an accessible mobile confirmation and is not repeated when reload fails', async ({
  page,
  request,
}, info) => {
  const f = await fixture(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(privacyUrl + '/' + privacyId);
  await prepare(page);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('privacy-confirmation-mobile.png') });
  // The confirm preflight succeeds; fail only the post-command detail read.
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON();
    if (call.name === 'admin_business_privacy_command_v1') f.failReads();
    return route.fallback();
  });
  await page.getByRole('button', { name: 'Confirm action' }).dblclick();
  await expect(page.getByRole('button', { name: 'Retry privacy record' })).toBeVisible();
  await expect(
    page.getByText('Action recorded. Current record requested; no email was sent.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toHaveCount(0);
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]!.args).toMatchObject({
    p_case_id: privacyId,
    p_revision: 32,
    p_action: 'complete',
    p_reference: 'support-ref-001',
  });
  expect(f.external).toEqual([]);
});
test('unknown outcome retains identical action across changed reads and failed reads', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  f.unknown();
  await page.goto(privacyUrl + '/' + privacyId);
  await prepare(page, 'Deny request');
  await page.getByRole('button', { name: 'Confirm action' }).click();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Denied', { exact: true })).toBeVisible();
  f.failReads();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry privacy record' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry identical action' }).click();
  await expect(
    page.getByText('Action recorded. Current record requested; no email was sent.'),
  ).toBeVisible();
  expect(f.writes).toHaveLength(2);
  expect(f.writes[0]).toEqual(f.writes[1]);
});
test('changed ownership blocks confirmation and server rejection requires refresh', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  await page.goto(privacyUrl + '/' + privacyId);
  await prepare(page);
  Object.assign(f.owner, {
    revision: 3,
    assigned_to: null,
    owner_label: 'Unassigned',
    can_claim: true,
    can_release: false,
  });
  await page.getByRole('button', { name: 'Confirm action' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: 'Reload action form' }).click();
  f.reject();
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByRole('button', { name: 'Refresh record', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh record', exact: true }).click();
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText('Privacy reviewer (you)', { exact: true })).toBeVisible();
  expect(f.writes[0]!.args.p_request_id).not.toBe(f.writes[1]!.args.p_request_id);
});
test('another case hold blocks preparation and access loss clears the action form', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  Object.assign(f.data, {
    kind: 'erasure',
    hold: { reference: 'legal-hold-001', case_id: '70000000-0000-4000-8000-000000000007' },
  });
  await page.goto(privacyUrl + '/' + privacyId);
  await page.getByRole('combobox', { name: 'Action', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Prepare erasure' })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Release retention hold' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await prepare(page, 'Deny request');
  f.deny();
  await page.getByRole('button', { name: 'Confirm action' }).click();
  await expect(page.getByRole('button', { name: 'Retry privacy record' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(f.writes).toEqual([]);
});
