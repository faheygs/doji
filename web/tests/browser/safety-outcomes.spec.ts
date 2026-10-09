import { test, expect } from '@playwright/test';
import { installSafetyFixture, safetyId, safetyActor } from './safety-fixture';
const url = 'https://admin.dojipro.com/connected.html#/trust-safety/external/' + safetyId;

test('assigned reviewer starts review without fields and then requests information', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request);
  f.item.assigned_to = safetyActor;
  await page.goto(url);
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Start review' }).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start review', exact: true }).click();
  expect(f.commands).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Saved. The current case is shown above.')).toBeVisible();
  expect(f.commands[0]?.p_input).toEqual({
    action: 'reviewing',
    note: 'Review started by assigned employee.',
  });
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Request information', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Internal review note' })
    .fill('The supplied reference needs clarification.');
  await page
    .getByRole('textbox', { name: 'Response for the requester' })
    .fill('Please clarify the exact content reference.');
  await page.getByRole('button', { name: 'Request information', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Saved. The current case is shown above.')).toBeVisible();
  expect(f.commands[1]?.p_input.action).toBe('needs_information');
  expect(f.commands[1]?.p_revision).toBe(2);
  expect(f.external).toEqual([]);
});

test('completed removal requires linked report and both restricted verification fields', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request);
  f.item.assigned_to = safetyActor;
  f.item.report_id = '50000000-0000-4000-8000-000000000005';
  f.item.queue = 'restricted_safety';
  f.item.request.detail = 'nonconsensual_intimate_images';
  await page.goto(url.replace('trust-safety', 'restricted-safety'));
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Record completed removal' }).click();
  await page
    .getByRole('textbox', { name: 'Internal review note' })
    .fill('Completed review of the linked moderation decision.');
  await page
    .getByRole('textbox', { name: 'Response for the requester' })
    .fill('The reported content has been removed.');
  const submit = page.getByRole('button', { name: 'Record completed removal', exact: true });
  await expect(submit).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Access revocation verification' })
    .fill('Synthetic access revocation evidence checked.');
  await expect(submit).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Identical-copy review' })
    .fill('Synthetic identical copy evidence checked.');
  await submit.click();
  expect(f.commands).toEqual([]);
  await expect(page.getByRole('dialog')).toContainText('does not remove content');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Saved. The current case is shown above.')).toBeVisible();
  expect(f.commands[0]?.p_input.action).toBe('removed');
  expect(f.commands[0]?.p_input.copies_review).toBe('Synthetic identical copy evidence checked.');
  expect(f.external).toEqual([]);
});

test('a server conflict requires refresh and never retries automatically', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request, 'conflict');
  await page.goto(url);
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await expect(
    page.getByText('This action was not accepted. Refresh the case before continuing.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry same action' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh case' }).click();
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeEnabled();
  expect(f.commands).toHaveLength(1);
});
