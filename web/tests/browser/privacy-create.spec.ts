import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installPrivacyFixture, privacyUrl } from './privacy-fixture';
import { privacyId, privacyAccount } from '../privacy-fixture';
test('verified request uses MUI date entry and an identical retry; failure to load the new case cannot create duplicates', async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await installPrivacyFixture(page, request),
    writes: Record<string, unknown>[] = [];
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON();
    if (call.name === 'get_admin_business_privacy_case_v1' && writes.length > 0)
      return route.fulfill({ status: 503, json: { message: 'Read unavailable' } });
    if (call.name !== 'admin_business_privacy_open_v1') return route.fallback();
    writes.push(call.args);
    return writes.length === 1
      ? route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } })
      : route.fulfill({ json: { id: privacyId, revision: 1, state: 'open' } });
  });
  await page.goto(privacyUrl);
  await page.getByRole('link', { name: 'Log verified request' }).click();
  await page.getByRole('textbox', { name: 'Verified business account ID' }).fill(privacyAccount);
  await page.getByRole('combobox', { name: 'Request type' }).click();
  await page.getByRole('option', { name: 'Access to information' }).click();
  await page
    .getByRole('textbox', { name: 'Verification reference', exact: true })
    .fill('support-verified-001');
  const date = page.getByRole('group', { name: 'Assessed response deadline' });
  for (const [name, value] of [
    ['Month', '10'],
    ['Day', '20'],
    ['Year', '2026'],
    ['Hours', '12'],
    ['Minutes', '00'],
    ['Meridiem', 'AM'],
  ] as const) {
    const section = date.getByRole('spinbutton', { name, exact: true });
    await section.click();
    await section.pressSequentially(value);
  }
  await expect(page.getByRole('button', { name: 'Review request', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('privacy-creation-confirmation.png') });
  await page.getByRole('button', { name: 'Record request', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Retry identical request' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Verified business account ID' })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry identical request' }).click();
  await expect(page.getByRole('button', { name: 'Retry privacy record' })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({
    p_account_id: privacyAccount,
    p_kind: 'access',
    p_verification_reference: 'support-verified-001',
  });
  expect(Number.isFinite(Date.parse(String(writes[0]!.p_due_at)))).toBe(true);
  expect(f.external).toEqual([]);
});
test('creation route denies a non-manager before any read or write', async ({ page, request }) => {
  const f = await installPrivacyFixture(page, request, false);
  await page.goto(privacyUrl + '/new');
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(f.calls.filter((call) => call.name !== 'get_admin_staff_event_channels_v1')).toEqual([]);
});
