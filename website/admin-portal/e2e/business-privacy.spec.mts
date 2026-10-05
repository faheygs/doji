import { must } from "../../test-contracts.mts";
import type { Page } from "@playwright/test";
import { test, expect } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend, seedAdminSession, operatorSession } from './fixtures.mts';
import type {MockOptions} from './fixtures.mts';
interface PrivacyCall {path:string;body:Record<string,unknown>}
interface PrivacyOptions {
 enabled?:boolean; session?:MockOptions['session'];
 item?:Partial<typeof base>;badPage?:boolean;wrongId?:boolean;wrongAccount?:boolean;
 correctionBlocked?:string;draftRevision?:number;conflict?:boolean;failure?:boolean;
}
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  account = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const holdId = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const entry = {
  revision: 1,
  action: 'received',
  evidence_reference: 'support:verified-1',
  occurred_at: '2026-09-30T12:00:00Z',
};
const base = {
  id,
  account_id: account,
  kind: 'closure',
  state: 'open',
  revision: 1,
  verification_reference: 'support:verified-1',
  received_at: '2026-09-30T12:00:00Z',
  due_at: '2026-10-15T12:00:00Z',
  hold: { reference: null as string|null, case_id: null as string|null },
  history: [entry],
  history_has_more: false,
};
const details = {
  legal_name: 'Example LLC',
  brand_name: 'Synthetic business',
  website: 'https://example.test',
  country: 'US',
  representative_name: 'Example Owner',
  representative_role: 'Owner',
  category: 'Technology',
  purpose: 'A future campaign',
};
async function setup(page: Page, options:PrivacyOptions = {}) {
  await installMockBackend(page, {
    employeeMode: true,
    businessMode: true,
    privacyMode: options.enabled !== false,
    session: options.session || operatorSession,
  });
  await seedAdminSession(page, true);
  const item = { ...structuredClone(base), ...options.item },
    calls:PrivacyCall[] = [];
  await page.route('**/rest/v1/rpc/*business*', async (route) => {
    const path = new URL(route.request().url()).pathname,
      body = route.request().postDataJSON();
    calls.push({ path, body });
    if (path.endsWith('get_admin_business_applications_page_v1'))
      return route.fulfill({ json: { items: [], next_cursor: null } });
    if (path.endsWith('get_admin_business_privacy_page_v1'))
      return route.fulfill({
        json: options.badPage ? {} : body.p_state === item.state ? [item] : [],
      });
    if (path.endsWith('get_admin_business_privacy_case_v1'))
      return route.fulfill({ json: options.wrongId ? { ...item, id: holdId } : item });
    if (path.endsWith('get_admin_business_privacy_correction_v1'))
      return route.fulfill({
        json: {
          case_id: id,
          account_id: options.wrongAccount ? holdId : account,
          case_revision: item.revision,
          correction_allowed: !options.correctionBlocked,
          blocked_reason: options.correctionBlocked || null,
          application: {
            id: holdId,
            state: 'changes_requested',
            revision: options.draftRevision || 3,
            details: { ...details, business_address: 'Historical address' },
          },
        },
      });
    if (path.endsWith('admin_business_privacy_open_v1'))
      return route.fulfill({ status: 503, json: { message: 'Unknown outcome' } });
    if (path.endsWith('admin_business_privacy_command_v1')) {
      if (options.conflict) return route.fulfill({ status: 409, json: { message: 'stale' } });
      if (options.failure)
        return route.fulfill({ status: 503, json: { message: 'Unknown outcome' } });
      item.revision++;
      item.history.push({ ...entry, revision: item.revision, action: body.p_action });
      if (body.p_action === 'prepare_erasure') item.state = 'prepared';
      if (body.p_action === 'complete') item.state = 'completed';
      return route.fulfill({ json: { id, revision: item.revision, state: item.state } });
    }
    if (path.endsWith('get_admin_business_privacy_access_v1'))
      return route.fulfill({
        json: {
          case_id: id,
          account_id: options.wrongAccount ? holdId : account,
          identity: { email: 'synthetic@example.test', name: 'Synthetic Owner' },
          signup_agreement: {
            terms_version: 'test-terms',
            privacy_version: 'test-notice',
            accepted_at: base.received_at,
          },
          application: { id: holdId, state: 'draft', revision: 3, details, response: '' },
          submissions: [
            {
              submission: 1,
              details,
              terms_version: 'test-terms',
              privacy_version: 'test-notice',
              accepted_at: base.received_at,
            },
          ],
          history: [],
          history_has_more: false,
        },
      });
    throw Error(`Unexpected RPC ${path}`);
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return { calls, item };
}
const privacyCalls = (calls:PrivacyCall[]) => calls.filter((c) => c.path.includes('privacy'));
test('verified current draft correction uses shared form, exact revision and preserved historical address', async ({
  page,
}) => {
  const { calls } = await setup(page, { item: { kind: 'correction' } });
  await open(page);
  const drawer = page.locator('dialog[open]');
  await drawer.getByRole('button', { name: 'Review current draft', exact: true }).click();
  await expect(drawer.locator('#privacyCorrection-brand_name')).toHaveValue('Synthetic business');
  await drawer.getByRole('combobox', { name: 'Action', exact: true }).click();
  await drawer.getByRole('option', { name: 'Save corrected draft', exact: true }).click();
  await drawer.locator('#privacyCorrection-brand_name').fill('Corrected Business');
  await drawer.getByLabel('Assessment / fulfillment reference').fill('support:correction-1');
  await drawer.locator('#privacyAcknowledged').check();
  await drawer.getByRole('button', { name: 'Review change', exact: true }).click();
  await expect(drawer.locator('#privacyConfirmation')).toContainText('Current draft revision 3');
  expect(calls.some((c) => c.path.endsWith('command_v1'))).toBe(false);
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('#privacyStatus')).toContainText('Change saved');
  const command = calls.find((c) => c.path.endsWith('command_v1'))!.body;
  expect(command).toMatchObject({
    p_case_id: id,
    p_revision: 1,
    p_application_revision: 3,
    p_action: 'correct_draft',
    p_details: { brand_name: 'Corrected Business', business_address: 'Historical address' },
  });
  expect(await drawer.locator('#privacyAction option').allTextContents()).toContain(
    'Complete request',
  );
});
for (const reason of ['review_required', 'erasure_prepared', 'no_application'])
  test(`correction read blocks ${reason}`, async ({ page }) => {
    await setup(page, { item: { kind: 'correction' }, correctionBlocked: reason });
    await open(page);
    await page.getByRole('button', { name: 'Review current draft', exact: true }).click();
    await expect(page.locator('#privacyDraft .editorialPreview')).toBeVisible();
    await expect(page.locator('#privacyCorrection-brand_name')).toHaveCount(0);
    expect(await page.locator('#privacyAction option').allTextContents()).not.toContain(
      'Save corrected draft',
    );
  });
test('mismatched correction account cannot expose a draft', async ({ page }) => {
  await setup(page, { item: { kind: 'correction' }, wrongAccount: true });
  await open(page);
  await page.getByRole('button', { name: 'Review current draft', exact: true }).click();
  await expect(page.locator('#privacyStatus')).toContainText('could not be verified');
  await expect(page.locator('#privacyDraft')).toBeEmpty();
});
test('changed application revision preserves draft entries and blocks save on foreground', async ({
  page,
}) => {
  const options = { item: { kind: 'correction' }, draftRevision: 3 };
  const { calls } = await setup(page, options);
  await open(page);
  const drawer = page.locator('dialog[open]');
  await drawer.getByRole('button', { name: 'Review current draft', exact: true }).click();
  await drawer.getByRole('combobox', { name: 'Action', exact: true }).click();
  await drawer.getByRole('option', { name: 'Save corrected draft', exact: true }).click();
  await drawer.locator('#privacyCorrection-brand_name').fill('Preserve my correction');
  options.draftRevision = 4;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(drawer.locator('#privacyStatus')).toContainText('application draft changed');
  await expect(drawer.locator('#privacyCorrection-brand_name')).toHaveValue(
    'Preserve my correction',
  );
  await expect(drawer.getByRole('button', { name: 'Review change', exact: true })).toBeDisabled();
  expect(calls.some((c) => c.path.endsWith('command_v1'))).toBe(false);
});
test('invalid personal reference cannot submit; corrected reference can be reviewed', async ({
  page,
}) => {
  const { calls } = await setup(page);
  await open(page);
  const drawer = await action(page, 'Close business access');
  await drawer.getByLabel('Assessment / fulfillment reference').fill('person@example.test');
  await drawer.getByRole('button', { name: 'Review change', exact: true }).click();
  await expect(drawer.locator('#privacyConfirmation')).toBeHidden();
  await drawer.getByLabel('Assessment / fulfillment reference').fill('support:valid-reference');
  await drawer.getByRole('button', { name: 'Review change', exact: true }).click();
  await expect(drawer.locator('#privacyConfirmation')).toBeVisible();
  expect(calls.some((c) => c.path.endsWith('command_v1'))).toBe(false);
});
test('confirmed commit remains successful when follow-up read fails', async ({ page }) => {
  const { calls } = await setup(page);
  await open(page);
  const drawer = await action(page, 'Close business access');
  await page.route('**/rpc/get_admin_business_privacy_case_v1', (route) =>
    route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
  );
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('#privacyStatus')).toContainText('Change saved, but');
  await expect(drawer.locator('#privacyForm')).toHaveCount(0);
  expect(calls.filter((c) => c.path.endsWith('command_v1'))).toHaveLength(1);
});
test('queue pages use exact deadline and ID cursor; filter resets it', async ({ page }) => {
  await setup(page);
  const requests:Record<string,unknown>[] = [];
  const rows = Array.from({ length: 25 }, (_, i) => ({
    ...base,
    id: `aaaaaaaa-bbbb-4ccc-8ddd-${String(i + 1).padStart(12, '0')}`,
  }));
  await page.route('**/rpc/get_admin_business_privacy_page_v1', (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({ json: body.p_after_id || body.p_state !== 'open' ? [] : rows });
  });
  await queue(page);
  // Applications have another Next page button before the privacy read finishes.
  // Resolve within the queue under test, never the last currently mounted pager.
  await page
    .locator('#privacyQueue')
    .getByRole('button', { name: 'Next page', exact: true })
    .click();
  await expect(page.locator('#privacyQueue')).toContainText('No requests in this page');
  expect(requests[1]!).toEqual({
    p_state: 'open',
    p_after_due: base.due_at,
    p_after_id: rows[24]!.id,
  });
  await page.getByRole('combobox', { name: 'Privacy request state', exact: true }).click();
  await page.getByRole('option', { name: 'Completed', exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2]!).toEqual({ p_state: 'completed', p_after_due: null, p_after_id: null });
});
test('application access history pages advance independently of case history', async ({ page }) => {
  await setup(page, { item: { kind: 'access' } });
  await open(page);
  const requests:Record<string,unknown>[] = [];
  await page.route('**/rpc/get_admin_business_privacy_access_v1', (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({
      json: {
        case_id: id,
        account_id: account,
        identity: null,
        application: null,
        submissions: [],
        history: body.p_after_revision
          ? []
          : [
              {
                revision: 17,
                action: 'submitted',
                response: 'Test snapshot',
                occurred_at: base.received_at,
              },
            ],
        history_has_more: !body.p_after_revision,
      },
    });
  });
  await page.getByRole('button', { name: 'Review application information', exact: true }).click();
  await page
    .getByRole('button', { name: 'Next 30 application history entries', exact: true })
    .click();
  await expect(page.locator('#privacyAccess')).toContainText('No entries in this page');
  expect(requests).toEqual([
    { p_case_id: id, p_after_revision: 0 },
    { p_case_id: id, p_after_revision: 17 },
  ]);
});
test('pending command is single-flight and locking discards its late completion', async ({
  page,
}) => {
  await setup(page);
  await open(page);
  const drawer = await action(page, 'Close business access');
  let release!: () => void,
    requests = 0;
  const gate = new Promise<void>((r) => { (release = r); });
  await page.route('**/rpc/admin_business_privacy_command_v1', async (route) => {
    requests++;
    await gate;
    await route.fulfill({ json: { id, revision: 2, state: 'open' } }).catch(() => {});
  });
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await expect(drawer.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Lock session', exact: true }).evaluate((b) => { if (!(b instanceof HTMLElement)) throw Error("Expected HTML button"); b.click(); });
  release();
  await expect(page.locator('.businessPrivacyDialog')).toBeEmpty();
  await expect(page.locator('#businessPrivacy')).toBeEmpty();
  expect(requests).toBe(1);
});
async function queue(page: Page) {
  await page.locator('[data-view="businesses"]').click();
  await page.getByRole('button', { name: 'Open privacy queue', exact: true }).click();
}
async function open(page: Page) {
  await queue(page);
  await page.locator('[data-privacy-case]').click();
}
async function action(page: Page, name:string) {
  const drawer = page.locator('dialog[open]');
  await drawer.getByRole('combobox', { name: 'Action', exact: true }).click();
  await drawer.getByRole('option', { name, exact: true }).click();
  await drawer.getByLabel('Assessment / fulfillment reference').fill('support:reviewed-1');
  await drawer.locator('#privacyAcknowledged').check();
  await drawer.getByRole('button', { name: 'Review change', exact: true }).click();
  return drawer;
}
test('privacy disabled makes no requests and shows no controls', async ({ page }) => {
  const { calls } = await setup(page, { enabled: false });
  await page.locator('[data-view="businesses"]').click();
  await expect(page.getByRole('button', { name: 'Open privacy queue', exact: true })).toHaveCount(
    0,
  );
  expect(privacyCalls(calls)).toHaveLength(0);
});
for (const missing of ['operator_manage', 'legal_read'])
  test(`privacy requires ${missing}`, async ({ page }) => {
    const { calls } = await setup(page, {
      session: {
        ...operatorSession,
        capabilities: { ...operatorSession.capabilities, [missing]: false },
      },
    });
    await page.locator('[data-view="businesses"]').click();
    await expect(page.getByRole('button', { name: 'Open privacy queue', exact: true })).toHaveCount(
      0,
    );
    expect(privacyCalls(calls)).toHaveLength(0);
  });
test('privacy reads are lazy and case drawer is exact, structured and bounded', async ({
  page,
}) => {
  const { calls } = await setup(page);
  await page.locator('[data-view="businesses"]').click();
  expect(privacyCalls(calls)).toHaveLength(0);
  await page.getByRole('button', { name: 'Open privacy queue', exact: true }).click();
  await page.locator('[data-privacy-case]').click();
  const drawer = page.locator('dialog[open]');
  await expect(drawer.getByLabel('Business account ID', { exact: true })).toHaveValue(account);
  expect(privacyCalls(calls).map((c) => c.body)).toEqual([
    { p_state: 'open', p_after_due: null, p_after_id: null },
    { p_case_id: id, p_after_revision: 0 },
  ]);
  await expect(drawer).toHaveClass(/portalDrawer/);
  await expect(drawer.getByText('Recorded in workflow', { exact: true })).toBeVisible();
});
test('closure needs explicit confirmation and unchanged retry retains its key across reopening', async ({
  page,
}) => {
  const { calls } = await setup(page, { failure: true });
  await open(page);
  let drawer = await action(page, 'Close business access');
  expect(calls.filter((c) => c.path.endsWith('command_v1'))).toHaveLength(0);
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('#privacyStatus')).toContainText('could not be confirmed');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('[data-privacy-case]').click();
  drawer = await action(page, 'Close business access');
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('#privacyStatus')).toContainText('could not be confirmed');
  const commands = calls.filter((c) => c.path.endsWith('command_v1'));
  expect(commands).toHaveLength(2);
  expect(commands[1]!.body).toEqual(commands[0]!.body);
  expect(commands[0]!.body).toMatchObject({
    p_case_id: id,
    p_revision: 1,
    p_action: 'close_account',
    p_reference: 'support:reviewed-1',
  });
});
test('changing confirmation fields cancels the old confirmation and intent', async ({ page }) => {
  const { calls } = await setup(page, { failure: true });
  await open(page);
  const drawer = await action(page, 'Close business access');
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('#privacyStatus')).toContainText('could not be confirmed');
  await drawer.getByLabel('Assessment / fulfillment reference').fill('support:reviewed-2');
  await expect(drawer.locator('#privacyConfirmation')).toBeHidden();
  await drawer.getByRole('button', { name: 'Review change', exact: true }).click();
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('#privacyStatus')).toContainText('could not be confirmed');
  const commands = calls.filter((c) => c.path.endsWith('command_v1'));
  expect(commands[0]!.body.p_request_id).not.toBe(commands[1]!.body.p_request_id);
});
test('conflict preserves reference and blocks stale confirmation', async ({ page }) => {
  const { calls } = await setup(page, { conflict: true });
  await open(page);
  const drawer = await action(page, 'Close business access');
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('#privacyStatus')).toContainText('Close and reopen');
  await expect(drawer.getByLabel('Assessment / fulfillment reference')).toHaveValue(
    'support:reviewed-1',
  );
  await expect(drawer.getByRole('button', { name: 'Review change', exact: true })).toBeDisabled();
  expect(calls.filter((c) => c.path.endsWith('command_v1'))).toHaveLength(1);
});
test('foreground checks preserve dirty entries and invalidate confirmation on changed hold', async ({
  page,
}) => {
  const { item, calls } = await setup(page);
  await open(page);
  const drawer = await action(page, 'Close business access');
  item.hold = { reference: 'legal:hold-123', case_id: holdId };
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(drawer.locator('#privacyStatus')).toContainText('Close and reopen');
  await expect(drawer.getByLabel('Assessment / fulfillment reference')).toHaveValue(
    'support:reviewed-1',
  );
  await expect(drawer.locator('#privacyConfirmation')).toBeHidden();
  expect(calls.filter((c) => c.path.endsWith('command_v1'))).toHaveLength(0);
});
test('retention hold from another case hides release and erasure preparation', async ({ page }) => {
  await setup(page, {
    item: { kind: 'erasure', hold: { reference: 'legal:hold-123', case_id: holdId } },
  });
  await open(page);
  const drawer = page.locator('dialog[open]');
  await expect(
    drawer.getByRole('button', { name: 'Open hold-owning case', exact: true }),
  ).toBeVisible();
  expect(await drawer.locator('#privacyAction option').allTextContents()).not.toContain(
    'Prepare erasure',
  );
  expect(await drawer.locator('#privacyAction option').allTextContents()).not.toContain(
    'Release retention hold',
  );
});
test('erasure preparation never invokes deletion or marks final completion', async ({ page }) => {
  const { calls } = await setup(page, { item: { kind: 'erasure' } });
  await open(page);
  const drawer = await action(page, 'Prepare erasure');
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('.eyebrow')).toContainText('Erasure prepared');
  await expect(drawer.getByText(/there is no delete button here/)).toBeVisible();
  const commands = calls.filter((c) => c.path.endsWith('command_v1'));
  expect(commands).toHaveLength(1);
  expect(commands[0]!.body.p_action).toBe('prepare_erasure');
  expect(calls.some((c) => /claim_business|finish_business/.test(c.path))).toBe(false);
  expect(await drawer.locator('#privacyAction option').allTextContents()).not.toContain(
    'Complete request',
  );
});
test('correction requires explicit current draft read; no raw JSON or premature fulfillment', async ({
  page,
}) => {
  await setup(page, { item: { kind: 'correction' } });
  await open(page);
  const drawer = page.locator('dialog[open]');
  await expect(
    drawer.getByText(/Corrections apply only to the current application draft/),
  ).toBeVisible();
  await expect(
    drawer.getByRole('button', { name: 'Review current draft', exact: true }),
  ).toBeVisible();
  expect(await drawer.locator('#privacyAction option').allTextContents()).not.toContain(
    'Complete request',
  );
  await expect(drawer.locator('textarea')).toHaveCount(0);
});
test('access read is explicit and shares readable application fields without sending/exporting', async ({
  page,
}) => {
  const { calls } = await setup(page, { item: { kind: 'access' } });
  await open(page);
  expect(calls.some((c) => c.path.endsWith('access_v1'))).toBe(false);
  await page.getByRole('button', { name: 'Review application information', exact: true }).click();
  const drawer = page.locator('dialog[open]');
  await expect(drawer.getByLabel('Business account email', { exact: true })).toHaveValue(
    'synthetic@example.test',
  );
  await expect(drawer.locator('#privacyApplication-legal_name')).toHaveValue('Example LLC');
  await expect(drawer.getByText(/Nothing is automatically downloaded or sent/)).toBeVisible();
  await drawer.getByText('Submission 1', { exact: true }).click();
  await expect(drawer.locator('#privacySubmission0-legal_name')).toHaveValue('Example LLC');
});
test('wrong access account does not disclose returned information', async ({ page }) => {
  await setup(page, { item: { kind: 'access' }, wrongAccount: true });
  await open(page);
  await page.getByRole('button', { name: 'Review application information', exact: true }).click();
  await expect(page.locator('#privacyStatus')).toContainText('could not be verified');
  await expect(page.locator('#privacyAccess')).toBeEmpty();
});
test('wrong case identity and malformed queue fail closed', async ({ page }) => {
  await setup(page, { wrongId: true });
  await open(page);
  await expect(page.locator('#privacyStatus')).toContainText('could not be verified');
  await expect(page.locator('#privacyForm')).toHaveCount(0);
});
test('queue read failure is not represented as zero requests', async ({ page }) => {
  await setup(page, { badPage: true });
  await queue(page);
  await expect(page.getByText('Privacy queue unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry privacy queue' })).toBeVisible();
});
test('new request validates identity and assessed deadline before confirmed write', async ({
  page,
}) => {
  const { calls } = await setup(page);
  await page.locator('[data-view="businesses"]').click();
  await page.getByRole('button', { name: 'Record request', exact: true }).click();
  const drawer = page.locator('dialog[open]');
  await drawer.getByLabel('Verified business account ID').fill(account);
  await drawer.getByRole('combobox', { name: 'Request type', exact: true }).click();
  await drawer.getByRole('option', { name: 'Access to information', exact: true }).click();
  await drawer
    .getByLabel('Identity and authority verification reference')
    .fill('support:verified-1');
  await drawer.getByLabel('Assessed response deadline (your local time)').fill('2026-10-15T12:00');
  await drawer.locator('#privacyVerified').check();
  await drawer.getByRole('button', { name: 'Review request', exact: true }).click();
  expect(calls.some((c) => c.path.endsWith('open_v1'))).toBe(false);
  for (let i = 0; i < 2; i++) {
    await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(drawer.locator('#privacyStatus')).toContainText('could not be confirmed');
  }
  const opens = calls.filter((c) => c.path.endsWith('open_v1'));
  expect(opens[0]!.body).toEqual(opens[1]!.body);
  expect(opens[0]!.body.p_account_id).toBe(account);
});
test('locking clears case information and late access result cannot repaint', async ({ page }) => {
  await setup(page, { item: { kind: 'access' } });
  await open(page);
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((r) => { (release = r); });
  await page.route('**/rpc/get_admin_business_privacy_access_v1', async (route) => {
    started = true;
    await gate;
    await route
      .fulfill({
        json: {
          case_id: id,
          account_id: account,
          identity: { email: 'never-render@example.test' },
          submissions: [],
          history: [],
          history_has_more: false,
        },
      })
      .catch(() => {});
  });
  await page.getByRole('button', { name: 'Review application information', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Lock session', exact: true }).evaluate((b) => { if (!(b instanceof HTMLElement)) throw Error("Expected HTML button"); b.click(); });
  release();
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect(page.locator('#businessPrivacy')).toBeEmpty();
  await expect(page.locator('.businessPrivacyDialog')).toBeEmpty();
});
test('history uses bounded advancing cursor and rejects changes while paging', async ({ page }) => {
  const history = Array.from({ length: 30 }, (_, i) => ({ ...entry, revision: i + 1 }));
  await setup(page, { item: { revision: 31, history, history_has_more: true } });
  await open(page);
  let body;
  await page.route('**/rpc/get_admin_business_privacy_case_v1', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        ...base,
        revision: 31,
        history: [{ ...entry, revision: 31 }],
        history_has_more: false,
      },
    });
  });
  await page.getByRole('button', { name: 'Next 30 history entries', exact: true }).click();
  await expect(page.locator('#privacyHistory')).toContainText('Revision 31');
  expect(body).toEqual({ p_case_id: id, p_after_revision: 30 });
  await expect(
    page.getByRole('button', { name: 'Next 30 history entries', exact: true }),
  ).toBeHidden();
});
test('correction completion becomes available after reviewing a later history page', async ({
  page,
}) => {
  const history = Array.from({ length: 30 }, (_, i) => ({ ...entry, revision: i + 1 }));
  await setup(page, {
    item: { kind: 'correction', revision: 31, history, history_has_more: true },
  });
  await open(page);
  await expect(page.locator('#privacyAction option[value="complete"]')).toHaveCount(0);
  await page.route('**/rpc/get_admin_business_privacy_case_v1', (route) =>
    route.fulfill({
      json: {
        ...base,
        kind: 'correction',
        revision: 31,
        history: [{ ...entry, revision: 31, action: 'correct_draft' }],
        history_has_more: false,
      },
    }),
  );
  await page.getByRole('button', { name: 'Next 30 history entries', exact: true }).click();
  await expect(page.locator('#privacyAction option[value="complete"]')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Action', exact: true }).click();
  await page.getByRole('option', { name: 'Complete request', exact: true }).click();
  await page.locator('#privacyActionReference').fill('support:fulfilled-31');
  await page.locator('#privacyAcknowledged').check();
  await page.getByRole('button', { name: 'Review change', exact: true }).click();
  await expect(page.locator('#privacyConfirmation')).toBeVisible();
});
for (const theme of ['light', 'dark'])
  for (const width of [390, 1440])
    test(`privacy drawer accessibility ${width} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await setup(page);
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      if (width < 600) await page.locator('#mobileMenu').click();
      await open(page);
      const drawer = page.locator('dialog[open]');
      const bounds = must(await drawer.boundingBox());
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      await page.screenshot({ path: testInfo.outputPath(`privacy-${theme}-${width}.png`) });
    });
for (const theme of ['light', 'dark'])
  test(`editable correction accessibility ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await setup(page, { item: { kind: 'correction' } });
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await page.locator('#mobileMenu').click();
    await open(page);
    await page.getByRole('button', { name: 'Review current draft', exact: true }).click();
    await expect(page.locator('#privacyDraft')).toContainText('Current editable draft');
    await page.getByRole('combobox', { name: 'Action', exact: true }).click();
    await page.getByRole('option', { name: 'Save corrected draft', exact: true }).click();
    const drawer = page.locator('dialog[open]');
    expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    await page.locator('#privacyDraft').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`correction-${theme}-390.png`) });
  });
