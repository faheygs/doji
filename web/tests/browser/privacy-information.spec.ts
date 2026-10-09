import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installPrivacyFixture, privacyUrl } from './privacy-fixture';
import { privacyId, privacyFixture } from '../privacy-fixture';
import { privacyInformation, privacyCorrectionFixture } from '../privacy-information-fixture';
async function fixture(page: Page, request: APIRequestContext, kind = 'access') {
  const f = await installPrivacyFixture(page, request);
  f.data.kind = kind;
  const correction = privacyCorrectionFixture(),
    writes: Record<string, unknown>[] = [],
    reads: string[] = [];
  let unknown = false,
    denied = false;
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON();
    if (
      ['get_admin_business_privacy_access_v1', 'get_admin_business_privacy_correction_v1'].includes(
        call.name,
      )
    ) {
      reads.push(call.name);
      if (denied) return route.fulfill({ status: 403, json: { message: 'Denied' } });
      return route.fulfill({
        json: call.name.includes('_access_')
          ? privacyInformation(Number(call.args.p_after_revision))
          : { ...correction, case_revision: f.data.revision },
      });
    }
    if (call.name === 'get_admin_business_privacy_case_v1' && kind === 'correction') {
      const value = {
        ...privacyFixture(Number(call.args.p_after_revision), f.data.revision),
        kind,
      };
      if (f.data.revision > 32)
        value.history = value.history.map((row) =>
          row.revision === 33 ? { ...row, action: 'correct_draft' } : row,
        );
      return route.fulfill({ json: value });
    }
    if (call.name !== 'admin_business_privacy_command_v1') return route.fallback();
    writes.push(call.args);
    Object.assign(correction.application, {
      details: call.args.p_details,
      revision: Number(call.args.p_application_revision) + 1,
    });
    f.data.revision = Number(call.args.p_revision) + 1;
    if (unknown) {
      unknown = false;
      return route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
    }
    return route.fulfill({
      json: { id: privacyId, revision: Number(call.args.p_revision) + 1, state: 'open' },
    });
  });
  return {
    ...f,
    correction,
    writes,
    reads,
    unknown: () => {
      unknown = true;
    },
    denyData: () => {
      denied = true;
    },
  };
}
test('protected data is explicit, bounded, provider-aware, and cleared after denied refresh', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  await page.goto(privacyUrl + '/' + privacyId);
  await expect(page.getByRole('heading', { name: 'Request details' })).toBeVisible();
  expect(f.reads).toEqual([]);
  await page.getByRole('button', { name: 'Review protected application information' }).click();
  await expect(page.getByText(/WorkOS business identity: provider-held/)).toBeVisible();
  await expect(page.getByText('Example brand', { exact: true })).toBeVisible();
  await expect(page.getByText('Recorded response 1', { exact: true })).toBeVisible();
  const information = page
    .getByRole('heading', { name: 'Protected application information' })
    .locator('..');
  await information.getByRole('button', { name: 'Go to next page', exact: true }).click();
  await expect(page.getByText('Recorded response 31', { exact: true })).toBeVisible();
  await expect(page.getByText('Recorded response 1', { exact: true })).toHaveCount(0);
  f.denyData();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry protected information' })).toBeVisible();
  await expect(page.getByText('Example brand', { exact: true })).toHaveCount(0);
  expect(f.writes).toEqual([]);
  expect(f.external).toEqual([]);
});
test('correction preserves address and retries the exact draft; completion follows recorded history', async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page, request, 'correction');
  f.unknown();
  await page.goto(privacyUrl + '/' + privacyId);
  await page.getByRole('button', { name: 'Review current draft for correction' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Business address', exact: true }),
  ).toHaveAttribute('readonly', '');
  await page
    .getByRole('textbox', { name: 'Public brand name', exact: true })
    .fill('Corrected brand');
  await page
    .getByRole('textbox', { name: 'Correction evidence reference' })
    .fill('support-correction-001');
  await page.getByRole('button', { name: 'Review corrected draft' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('privacy-correction-confirmation.png') });
  await page.getByRole('button', { name: 'Save corrected draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Retry identical action' }).click();
  await expect(
    page.getByText('Action recorded. Current record requested; no email was sent.'),
  ).toBeVisible();
  expect(f.writes).toHaveLength(2);
  expect(f.writes[0]).toEqual(f.writes[1]);
  expect(f.writes[0]).toMatchObject({
    p_action: 'correct_draft',
    p_revision: 32,
    p_application_revision: 32,
    p_details: { brand_name: 'Corrected brand', business_address: 'Retained address' },
  });
  await page.getByRole('button', { name: 'Latest case history' }).click();
  await expect(page.getByRole('cell', { name: 'correct draft', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Action', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Complete request' })).toBeVisible();
});
test('changed draft and blocked correction cannot be saved', async ({ page, request }) => {
  const f = await fixture(page, request, 'correction');
  await page.goto(privacyUrl + '/' + privacyId);
  await page.getByRole('button', { name: 'Review current draft for correction' }).click();
  await page.getByRole('textbox', { name: 'Public brand name', exact: true }).fill('Changed brand');
  await page
    .getByRole('textbox', { name: 'Correction evidence reference' })
    .fill('support-correction-001');
  await page.getByRole('button', { name: 'Review corrected draft' }).click();
  f.correction.application.revision++;
  await page.getByRole('button', { name: 'Save corrected draft', exact: true }).click();
  await expect(page.getByText(/editable draft could not be reverified/)).toBeVisible();
  expect(f.writes).toEqual([]);
  Object.assign(f.correction, { correction_allowed: false, blocked_reason: 'erasure_prepared' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByText('Erasure is already prepared; draft correction is blocked.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Public brand name', exact: true })).toHaveCount(
    0,
  );
});
