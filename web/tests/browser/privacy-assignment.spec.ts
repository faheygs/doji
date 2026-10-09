import { expect, test } from '@playwright/test';
import { installPrivacyFixture, privacyUrl } from './privacy-fixture';
import { privacyAccount, privacyId } from '../privacy-fixture';
test('privacy assignment uses the bounded case-specific directory and preserves unknown retry target', async ({
  page,
  request,
}) => {
  const f = await installPrivacyFixture(page, request);
  const writes: Record<string, unknown>[] = [],
    directory: Record<string, unknown>[] = [];
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON();
    if (call.name === 'get_admin_case_assignees_v1') {
      directory.push(call.args);
      return route.fulfill({
        json: {
          items: [{ id: privacyAccount, label: 'Eligible privacy reviewer' }],
          next_cursor: null,
        },
      });
    }
    if (call.name !== 'admin_case_ownership_command_v1') return route.fallback();
    writes.push(call.args);
    Object.assign(f.owner, {
      assigned_to: privacyAccount,
      owner_label: 'Eligible privacy reviewer',
      revision: 3,
    });
    if (writes.length === 1)
      return route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
    return route.fulfill({
      json: {
        kind: 'business_privacy',
        id: privacyId,
        revision: 3,
        assigned_to: privacyAccount,
        replayed: true,
      },
    });
  });
  await page.goto(privacyUrl + '/' + privacyId);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await page.getByRole('combobox', { name: 'New assignee' }).click();
  await page.getByRole('option', { name: 'Eligible privacy reviewer' }).click();
  await page.getByRole('button', { name: 'Assign reviewer' }).click();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry identical action' }).click();
  await expect(page.getByText('Eligible privacy reviewer', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({
    p_kind: 'business_privacy',
    p_id: privacyId,
    p_action: 'assign',
    p_target: privacyAccount,
    p_revision: 2,
    p_source_version: '32',
  });
  expect(directory[0]).toEqual({
    p_kind: 'business_privacy',
    p_id: privacyId,
    p_after_id: null,
    p_limit: 25,
  });
  await expect(page.getByRole('combobox', { name: 'Action', exact: true })).toHaveCount(0);
  expect(f.external).toEqual([]);
});
test('closed-case retention maintenance remains accessible without reopening ownership', async ({
  page,
  request,
}) => {
  const f = await installPrivacyFixture(page, request);
  Object.assign(f.data, {
    state: 'denied',
    hold: { reference: 'legal-hold-001', case_id: privacyId },
  });
  Object.assign(f.owner, {
    actionable: false,
    can_decide: false,
    can_claim: false,
    can_assign: false,
    can_release: false,
    assigned_to: null,
    owner_label: 'Unassigned',
  });
  await page.goto(privacyUrl + '/' + privacyId);
  await page.getByRole('combobox', { name: 'Action', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Release retention hold' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Complete request' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Start review' })).toHaveCount(0);
  expect(f.calls.every((call) => call.name.startsWith('get_admin_'))).toBe(true);
});
