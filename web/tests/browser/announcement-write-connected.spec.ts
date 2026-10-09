import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBusinessFixture } from './business-fixture';
import { announcementFixture, announcementId } from '../announcement-fixture';
async function setup(page: Page, request: APIRequestContext, mode = 'success') {
  const base = await installBusinessFixture(page, request, 'success', true, true);
  let item = {
    ...announcementFixture(),
    state: 'draft',
    display_state: 'draft',
    version: 'a'.repeat(32),
    starts_at: '2035-01-01T12:00:00Z',
    ends_at: '2035-01-02T12:00:00Z',
    reward_action: null,
    reward_sparks: 0,
  };
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: '10000000-0000-4000-8000-000000000001',
          display_name: 'Synthetic reviewer',
          capabilities: { operations_read: true, operator_manage: mode !== 'denied' },
        },
      },
    }),
  );
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON() as (typeof writes)[number];
    if (call.name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    if (call.name === 'get_admin_editorial_page_v1')
      return route.fulfill({ json: { items: [item], next_cursor: null, can_write: true } });
    if (call.name === 'get_admin_editorial_item_v1') return route.fulfill({ json: item });
    if (call.name === 'admin_announcement_compose_v1') {
      writes.push(call);
      if (mode === 'conflict') return route.fulfill({ status: 409, json: {} });
      const payload = call.args.p_input as Record<string, unknown>;
      const draft = call.args.p_action === 'save_draft';
      item = {
        ...item,
        ...payload,
        version: 'b'.repeat(32),
        state: draft ? 'draft' : 'published',
        display_state: draft ? 'draft' : 'scheduled',
      };
      if (mode === 'uncertain' && writes.length === 1)
        return route.fulfill({ status: 503, json: {} });
      return route.fulfill({
        json: {
          item,
          replayed: writes.length > 1,
          command: {
            id: announcementId,
            action: call.args.p_action,
            request_id: call.args.p_request_id,
            state: item.state,
            display_state: item.display_state,
            version: item.version,
          },
        },
      });
    }
    if (call.name === 'admin_editorial_command_v1') {
      writes.push(call);
      item = { ...item, state: 'cancelled', display_state: 'cancelled' };
      return route.fulfill({ json: item });
    }
    return route.fulfill({ status: 403, json: {} });
  });
  return { ...base, writes };
}
test('connected draft saves then cancels with explicit confirmation and exact audited reason', async ({
  page,
  request,
}) => {
  const fixture = await setup(page, request);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(
    'https://admin.dojipro.com/connected.html#/announcements/' + announcementId + '/edit',
  );
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Synthetic member message',
  );
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Revised message');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'View current record' }).click();
  await expect(page.getByRole('heading', { name: 'Revised message', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel announcement', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Cancellation reason' })
    .fill('This was scheduled by mistake.');
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.writes[1]?.args).toMatchObject({
    p_kind: 'announcements',
    p_action: 'cancel',
    p_reason: 'This was scheduled by mistake.',
  });
  expect(fixture.external).toEqual([]);
});
test('uncertain schedule retains identical intent through navigation and retries once', async ({
  page,
  request,
}) => {
  const fixture = await setup(page, request, 'uncertain');
  await page.goto(
    'https://admin.dojipro.com/connected.html#/announcements/' + announcementId + '/edit',
  );
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to editing' })).toBeDisabled();
  await page.evaluate(() => {
    location.hash = '#/announcements/new';
  });
  await page.getByRole('button', { name: 'Resume pending action' }).click();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry identical action' }).click();
  await expect(page.getByRole('button', { name: 'View current record' })).toBeVisible();
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.writes[0]).toEqual(fixture.writes[1]);
  expect(fixture.external).toEqual([]);
});
test('conflicts require refresh instead of another publication; read-only role cannot edit', async ({
  page,
  request,
}) => {
  const fixture = await setup(page, request, 'conflict');
  await page.goto(
    'https://admin.dojipro.com/connected.html#/announcements/' + announcementId + '/edit',
  );
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return to record' })).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }),
  ).toBeDisabled();
  expect(fixture.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Return to record' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic member message', exact: true })).toBeVisible();
});
test('read-only role cannot edit a direct announcement URL', async ({ page, request }) => {
  const fixture = await setup(page, request, 'denied');
  await page.goto('https://admin.dojipro.com/connected.html#/announcements/new');
  await expect(page.getByText('Announcement editing is unavailable.')).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
});
test('new publication sends one atomic command with server-owned start time', async ({
  page,
  request,
}) => {
  const fixture = await setup(page, request);
  await page.goto('https://admin.dojipro.com/connected.html#/announcements/new');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('New member message');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Synthetic announcement, never sent.');
  const end = page.getByRole('group', { name: 'Stop showing (UTC)', exact: true });
  for (const [name, value] of [
    ['Month', '11'],
    ['Day', '03'],
    ['Year', '2035'],
    ['Hours', '08'],
    ['Minutes', '30'],
    ['Meridiem', 'AM'],
  ]) {
    const field = end.getByRole('spinbutton', { name: name!, exact: true });
    await field.click();
    await field.pressSequentially(value!);
  }
  await page.getByRole('button', { name: 'Publish now', exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Publish now', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View current record' })).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    name: 'admin_announcement_compose_v1',
    args: { p_id: null, p_version: null, p_action: 'publish' },
  });
  expect(fixture.writes[0]?.args.p_input).not.toHaveProperty('starts_at');
  expect(fixture.external).toEqual([]);
});
