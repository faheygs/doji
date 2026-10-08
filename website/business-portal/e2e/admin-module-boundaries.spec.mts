import type { Page } from "@playwright/test";
import { test, expect } from '../../coverage-fixture.mts';
import type {BusinessReviewClient,createBusinessReview} from '../../admin-portal/business-applications.mts';
import type {SafetyClient} from '../../admin-portal/safety-contracts.d.mts';
interface ModuleItem extends Record<string,unknown> {id:string;state:string;revision:unknown;details?:Record<string,unknown>}
type BusinessApi=ReturnType<typeof createBusinessReview>;
interface ModuleFixture {
 id:string;auth:number;allowed:boolean;saved:number;reports:unknown[];
 calls:{name:string;args:unknown}[];modes:Record<string,string>;
 waits:Record<string,{resolve:(value:unknown)=>void;reject:(error:unknown)=>void}>;
 item:ModuleItem|null;next?:{at:string;id:string};empty?:boolean;
 call?:<T>(name:string,args:unknown,result:T)=>Promise<T>;
 api?:Pick<BusinessApi,'clear'|'reconcile'>&Partial<Pick<BusinessApi,'load'|'open'|'destroy'>>;
 client?:SafetyClient;lock?:()=>void;task?:Promise<unknown>;disabledError?:string;
}
interface MountOptions {readonly?:boolean;item?:Record<string,unknown>;defaultSaved?:boolean;view?:string}
declare global {interface Window {moduleFixture:ModuleFixture}}
// Component-boundary tests use the public loopback artifact, which packages the
// standalone shared controls. Full admin journeys remain in admin-legacy-contracts.

async function mount(page: Page, kind:string, options:MountOptions = {}) {
  await page.route('**/module-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<link rel="stylesheet" href="/portal.css"><button id="opener">Open record</button><main id="root"></main><section data-portal-view="safety"><div class="viewIntro"><p>Safety</p></div></section><section data-portal-view="moderation"></section><script src="/portal-select.js"></script>',
    }),
  );
  await page.goto('/module-fixture');
  await page.evaluate(
    async ({ kind, options }) => {
      const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      const f:ModuleFixture = (window.moduleFixture = {
        id,
        auth: 0,
        allowed: true,
        calls: [],
        modes: {},
        waits: {},
        saved: 0,
        reports: [],
        item: null,
      });
      f.call = async <T,>(name:string, args:unknown, result:T):Promise<T> => {
        f.calls.push({ name, args });
        const mode = f.modes[name];
        if (mode === 'pending')
          return new Promise<T>((resolve, reject) => {
            // Fault-injection boundary: tests intentionally return malformed wire payloads.
            f.waits[name] = { resolve: value=>resolve(value as T), reject };
          });
        if (mode === 'error') throw Error('Synthetic service unavailable');
        if (mode === 'empty-error') throw {};
        if (name === 'page' && (mode === 'ten' || mode === 'empty')) {
          if (!result || typeof result !== 'object' || !('items' in result) || !Array.isArray(result.items)) throw Error('Expected page');
          return { items: mode === 'empty' ? [] : Array(10).fill(result.items[0]), next_cursor: null } as T;
        }
        if (mode === 'wrong') return { id: 'different' } as T;
        if (mode === 'oversized') {
          if (!result || typeof result!=='object' || !('items' in result) || !Array.isArray(result.items)) throw Error('Expected paged fixture');
          return { items: Array(26).fill(result.items[0]), next_cursor: null } as T;
        }
        return structuredClone(result);
      };
      const session = () =>
        f.allowed
          ? {
              capabilities: {
                business_read: true,
                operator_manage: options.readonly !== true,
                moderation_read: true,
                legal_read: true,
              },
            }
          : null;
      if (kind === 'business') {
        const moduleUrl='/admin-portal/business-applications.js';
        const { createBusinessReview }:typeof import('../../admin-portal/business-applications.mts') = await import(moduleUrl);
        f.item = {
          id,
          state: 'pending',
          revision: 2,
          details: { brand_name: 'Synthetic <business>', legal_name: 'Synthetic LLC' },
          latest_submission: { submission: 1, terms_version: 'terms', privacy_version: 'privacy' },
          history: [],
          ...options.item,
        };
        f.api = createBusinessReview({
          enabled: true,
          root: document.querySelector<HTMLElement>('#root')!,
          session,
          epoch: () => f.auth,
          client: {
            page: (args) =>
              f.call!('page', args, {
                items: [{ id, brand_name: f.item!.details?.brand_name as string|undefined, state: f.item!.state }],
                next_cursor: f.next || null,
              }),
            detail: (id) => f.call!('detail', id, f.item as unknown as Awaited<ReturnType<BusinessReviewClient['detail']>>),
            command: (args) =>
              f.call!('command', args, {
                application: { ...f.item, state: 'approved', revision: 3 } as unknown as Awaited<ReturnType<BusinessReviewClient['detail']>>,
              }),
          },
          ...(options.defaultSaved ? {} : { onSaved: () => f.saved++ }),
        });
        await f.api!.load!();
      } else {
        const moduleUrl='/admin-portal/safety-removal.js';
        await import(moduleUrl);
        f.item = {
          id,
          revision: 2,
          state: 'received',
          queue: 'restricted_safety',
          can_write: true,
          received_at: '2026-10-01T10:00:00Z',
          deadline_at: '2026-10-01T11:00:00Z',
          request: {
            reason: 'Safety',
            detail: 'nonconsensual_intimate_images',
            relationship: 'affected',
            name: 'Synthetic person',
          },
          history: [],
          ...options.item,
        };
        f.client = {
          hasSession: () => f.allowed,
          safetyPage: (...args) =>
            f.call!('page', args, { items: f.empty ? [] : [f.item as unknown as Awaited<ReturnType<SafetyClient['safetyCase']>>], next_cursor: f.next || null }),
          safetyCase: (id) => f.call!('detail', id, f.item as unknown as Awaited<ReturnType<SafetyClient['safetyCase']>>),
          reportCase: (id) => f.call!('report', id, { id }),
          safetyCommand: (args) => f.call!('command', args, { id, revision: 3, outcome: 'saved' }),
          safetyTarget: (...args) =>
            f.call!('target', args, {
              case_id: id,
              kind: args[1],
              id: args[2],
              owner_id: 'synthetic-owner',
              fingerprint: 'a'.repeat(64),
              detail: {
                text: 'Synthetic content',
                state: 'visible',
                photo_ref: 'private/reference',
              },
            }),
          safetyCreateReport: (args) =>
            f.call!('command', args, { id, revision: 3, outcome: 'saved' }),
        };
        f.api = window.DojiSafetyRemoval.create({
          client: f.client!,
          session,
          epoch: () => f.auth,
          enhanceControls: (root) =>
            root
              .querySelectorAll('select')
              .forEach((s) => window.DojiPortalSelect.enhance(s, true)),
          openReport: (detail) => f.reports.push(detail),
          ...(options.view ? { view: options.view } : {}),
        });
        await f.api!.reconcile();
      }
      f.lock = () => {
        f.auth++;
        f.allowed = false;
        f.api!.clear();
      };
    },
    { kind, options },
  );
}
async function open(page: Page, kind = 'business') {
  await page.locator(kind === 'business' ? '[data-application-id]' : '[data-case]').click();
  await expect(page.locator('dialog[open] h2')).not.toContainText('Loading');
}
async function select(page: Page, selector:string, value:string) {
  await page.locator(selector).evaluate((node, value) => {
    if (!(node instanceof HTMLSelectElement)) throw Error('Expected select');
    node.value = value;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function decision(page: Page) {
  await select(page, '#businessReviewDecision', 'approve');
  await page.locator('#businessReviewResponse').fill('Synthetic applicant response.');
  await page.locator('#businessReviewNote').fill('Synthetic reviewed evidence.');
  await page.getByRole('button', { name: 'Review decision', exact: true }).click();
}
async function workflow(page: Page, action = 'claim') {
  await select(page, '#safetyAction', action);
  await page.locator('#safetyNote').fill('Synthetic reviewed rationale.');
  if (action !== 'claim')
    await page.locator('#safetyMessage').fill('Synthetic requester response.');
  await page.getByRole('button', { name: 'Review change', exact: true }).click();
}

test('business module rejects disabled entry and ignores reads without capability', async ({
  page,
}) => {
  await mount(page, 'business');
  await page.evaluate(async () => {
    const moduleUrl='/admin-portal/business-applications.js';
    const { createBusinessReview }:typeof import('../../admin-portal/business-applications.mts') = await import(moduleUrl);
    try {
      // Deliberately incomplete disabled entry must throw before touching other dependencies.
      createBusinessReview({ enabled: false } as Parameters<typeof createBusinessReview>[0]);
    } catch (error) {
      window.moduleFixture.disabledError = error instanceof Error ? error.message : String(error);
    }
    window.moduleFixture.allowed = false;
    await window.moduleFixture.api!.open!('case');
    await window.moduleFixture.api!.load!();
  });
  expect(await page.evaluate(() => window.moduleFixture.disabledError)).toContain('not enabled');
  expect(await page.evaluate(() => window.moduleFixture.calls.length)).toBe(1);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

for (const kind of ['business', 'safety']) test(`${kind} queue keeps footer fixed for zero, one, ten, loading and failed reads`, async ({ page }, info) => {
  await mount(page, kind);
  await page.addStyleTag({ path: 'website/admin-portal/admin.css' });
  await page.evaluate(() => { document.body.className = 'adminPortalPage'; document.documentElement.dataset.theme = 'dark'; });
  const panel = page.locator(kind === 'business' ? '.businessQueuePanel' : '.safetyQueue');
  const footer = panel.locator('.tableFooter');
  const first = await footer.boundingBox();
  const panelHeight = (await panel.boundingBox())!.height;
  for (const mode of ['empty', 'ten', 'error']) {
    await page.evaluate(async mode => { const f = window.moduleFixture; f.modes.page = mode; await f.api!.reconcile(); }, mode);
    const box = await footer.boundingBox();
    expect(box!.y).toBeCloseTo(first!.y, 0);
    expect((await panel.boundingBox())!.height).toBe(panelHeight);
    if (mode === 'error') await expect(panel).toContainText('unavailable');
  }
  await page.evaluate(() => { const f = window.moduleFixture; f.modes.page = 'pending'; void f.api!.reconcile(); });
  await expect(panel.locator('.tableWrap')).toHaveAttribute('aria-busy', 'true');
  await expect(panel.locator('.queueState')).toContainText('Loading');
  const spinner = await panel.locator('.queueState').evaluate(el => getComputedStyle(el, '::before').animationName);
  expect(spinner).toBe('adminQueueSpin');
  expect((await footer.boundingBox())!.y).toBeCloseTo(first!.y, 0);
  await page.screenshot({ path: info.outputPath(`${kind}-loading.png`), fullPage: true });
});

test('external request opens from any row cell or keyboard and offers explicit confirmed closure', async ({ page }) => {
  await mount(page, 'safety', { view: 'moderation' });
  const row = page.locator('[data-case-row]');
  await row.locator('td').last().click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.getByRole('button', { name: 'Close request', exact: true }).click();
  await expect(page.locator('#safetyAction')).toHaveValue('not_actionable');
  await expect(page.locator('#safetyNote')).toBeFocused();
  await page.locator('#safetyNote').fill('Synthetic review found no actionable content.');
  await page.locator('#safetyMessage').fill('We reviewed this synthetic request and closed it.');
  await page.getByRole('button', { name: 'Review change', exact: true }).click();
  expect(await page.evaluate(() => window.moduleFixture.calls.filter(c => c.name === 'command'))).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm change', exact: true }).click();
  const calls = await page.evaluate(() => window.moduleFixture.calls.filter(c => c.name === 'command'));
  expect(calls).toHaveLength(1);
  expect(calls[0]!.args).toMatchObject({ p_revision: 2, p_input: { action: 'not_actionable' } });
  await page.locator('dialog[open] [data-close]').click();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog[open]')).toBeVisible();
});

test('read-only external case explains unavailable outcomes without offering a close command', async ({ page }) => {
  await mount(page, 'safety', { item: { can_write: false } });
  await open(page, 'safety');
  await expect(page.locator('.caseOutcomeBar')).toContainText('Your current permissions do not allow changes');
  await expect(page.getByRole('button', { name: 'Close request', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.moduleFixture.calls.filter(c => c.name === 'command'))).toHaveLength(0);
});
for (const mode of ['wrong', 'oversized'])
  test(`business invalid queue ${mode} is not empty success and can retry`, async ({ page }) => {
    await mount(page, 'business');
    await page.evaluate(async (mode) => {
      window.moduleFixture.modes.page = mode;
      await window.moduleFixture.api!.load!();
    }, mode);
    await expect(page.getByRole('status')).toHaveText(
      'The application queue could not be verified.',
    );
    await expect(page.locator('[data-application-id]')).toHaveCount(0);
    await page.evaluate(() => delete window.moduleFixture.modes.page);
    await page.getByRole('button', { name: 'Retry applications' }).click();
    await expect(page.locator('[data-application-id]')).toHaveCount(1);
  });
for (const state of ['approved', 'declined', 'changes_requested'])
  test(`business ${state} detail uses only applicable decisions and escaped history`, async ({
    page,
  }) => {
    await mount(page, 'business', {
      item: {
        state,
        details: {},
        history: [{ action: 'custom_action', response: '<img src=x>', internal_note: null }],
        history_has_more: true,
      },
    });
    await open(page);
    await expect(page.locator('#businessReviewTitle')).toHaveText('Business application');
    await expect(page.locator('dialog img')).toHaveCount(0);
    await expect(page.locator('dialog')).toContainText('Older history is retained');
    expect(await page.locator('#businessReviewDecision option').allTextContents()).toEqual(
      state === 'changes_requested' ? ['Choose a decision'] : ['Choose a decision', 'Reopen'],
    );
  });
test('business exact paging and first-page/filter resets stay bounded', async ({ page }) => {
  await mount(page, 'business');
  await page.evaluate(async () => {
    window.moduleFixture.next = { at: 'time', id: 'cursor' };
    await window.moduleFixture.api!.load!();
  });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled();
  expect(await page.evaluate(() => window.moduleFixture.calls.at(-1)!.args)).toEqual({
    p_state: 'pending',
    p_limit: 25,
    p_after_at: 'time',
    p_after_id: 'cursor',
  });
  await page.getByRole('button', { name: 'Previous' }).click();
  await select(page, '#businessQueueState', 'declined');
  await expect
    .poll(() => page.evaluate(() => window.moduleFixture.calls.at(-1)!.args))
    .toEqual({ p_state: 'declined', p_limit: 25, p_after_at: null, p_after_id: null });
});
for (const outcome of ['success', 'error'])
  test(`business late ${outcome} command cannot reopen locked workspace`, async ({ page }) => {
    await mount(page, 'business');
    await open(page);
    await decision(page);
    await page.evaluate(() => (window.moduleFixture.modes.command = 'pending'));
    await page.locator('#businessReviewApply').click();
    await page.evaluate(async () => {
      const f = window.moduleFixture;
      await f.api!.open!('other');
      await f.api!.reconcile();
      document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.evaluate((outcome) => {
      const f = window.moduleFixture;
      f.lock!();
      if (outcome === 'success') f.waits.command!.resolve({ application: f.item });
      else f.waits.command!.reject(Error('Late denial'));
    }, outcome);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => window.moduleFixture.saved)).toBe(0);
    await expect(page.locator('#root')).toBeEmpty();
  });
test('business unverified command receipt preserves input instead of claiming success', async ({
  page,
}) => {
  await mount(page, 'business');
  await open(page);
  await decision(page);
  await page.evaluate(() => (window.moduleFixture.modes.command = 'wrong'));
  await page.locator('#businessReviewApply').click();
  await expect(page.locator('dialog [role=status]')).toContainText(
    'identity could not be verified',
  );
  await expect(page.locator('#businessReviewNote')).toHaveValue('Synthetic reviewed evidence.');
  expect(await page.evaluate(() => window.moduleFixture.saved)).toBe(0);
});
test('business default saved callback succeeds and destroy removes protected detail', async ({
  page,
}) => {
  await mount(page, 'business', { defaultSaved: true });
  await open(page);
  await decision(page);
  await page.locator('#businessReviewApply').click();
  await expect(page.locator('#businessReviewDecision')).toHaveValue('');
  await expect(page.locator('dialog .eyebrow')).toContainText('Approved');
  await page.evaluate(() => window.moduleFixture.api!.destroy!());
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#root')).toBeEmpty();
});
for (const operation of ['page', 'detail'])
  test(`business late ${operation} cannot repaint after clear`, async ({ page }) => {
    await mount(page, 'business');
    await page.evaluate((operation) => {
      const f = window.moduleFixture;
      f.modes[operation] = 'pending';
      f.task = operation === 'page' ? f.api!.load!() : f.api!.open!(f.id);
    }, operation);
    await expect
      .poll(() => page.evaluate((operation) => !!window.moduleFixture.waits[operation], operation))
      .toBe(true);
    await page.evaluate(async (operation) => {
      const f = window.moduleFixture;
      f.lock!();
      f.waits[operation]!.resolve(operation === 'page' ? { items: [], next_cursor: null } : f.item);
      await f.task;
    }, operation);
    await expect(page.locator('#root')).toBeEmpty();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
test('business reconciliation coalesces and rejects mismatched current identity without losing notes', async ({
  page,
}) => {
  await mount(page, 'business');
  await open(page);
  await page.locator('#businessReviewNote').fill('Keep these review notes.');
  await page.evaluate(async () => {
    const f = window.moduleFixture;
    f.modes.detail = 'pending';
    f.task = f.api!.reconcile();
    await f.api!.reconcile();
    await f.api!.reconcile();
  });
  await page.evaluate(async () => {
    const f = window.moduleFixture;
    f.modes.detail = 'wrong';
    f.waits.detail!.resolve(f.item);
    await f.task;
  });
  await expect(page.locator('dialog [role=status]')).toContainText('could not be verified');
  await expect(page.locator('#businessReviewNote')).toHaveValue('Keep these review notes.');
  expect(
    await page.evaluate(() => window.moduleFixture.calls.filter((c) => c.name === 'detail').length),
  ).toBe(3);
});
test('business backdrop requires matching outside pointer down and up and restores focus', async ({
  page,
}) => {
  await mount(page, 'business');
  await open(page);
  await page.locator('dialog').dispatchEvent('pointerdown', { clientX: 400, clientY: 400 });
  await page.locator('dialog').dispatchEvent('pointerup', { clientX: -10, clientY: -10 });
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.locator('dialog').dispatchEvent('pointerdown', { clientX: -10, clientY: -10 });
  await page.locator('dialog').dispatchEvent('pointerup', { clientX: -10, clientY: -10 });
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('[data-application-id]')).toBeFocused();
});

for (const relation of ['representative', 'witness', undefined])
  test(`safety missing optional values and ${relation} relationship stay readable`, async ({
    page,
  }) => {
    await mount(page, 'safety', {
      item: {
        can_write: false,
        request: relation ? { relationship: relation } : null,
        classification: null,
        received_at: 'invalid',
        deadline_at: null,
        history: [
          {
            action: 'custom_action',
            occurred_at: 'invalid',
            internal_note: '<script>bad</script>',
            public_message: 'Public response',
          },
          { action: null },
        ],
      },
    });
    await open(page, 'safety');
    await expect(page.locator('dialog')).toContainText('Unavailable');
    await expect(page.locator('.safetyHistory')).toContainText('Custom action');
    await expect(page.locator('.safetyHistory')).toContainText('Case updated');
    await expect(page.locator('dialog script')).toHaveCount(0);
    await expect(page.locator('#safety-relationship')).toHaveValue(
      relation === 'representative'
        ? 'Authorized representative'
        : relation === 'witness'
          ? 'Third-party concern'
          : 'Affected person',
    );
    await expect(page.locator('[data-command]')).toHaveCount(0);
  });
for (const mode of ['success', 'wrong', 'empty-error', 'late'])
  test(`linked safety report ${mode} requires exact identity and current access`, async ({
    page,
  }) => {
    await mount(page, 'safety', {
      item: { report_id: 'report', closed_at: '2026-10-01T12:00:00Z' },
    });
    await open(page, 'safety');
    await page.evaluate((mode) => {
      window.moduleFixture.modes.report = mode === 'late' ? 'pending' : mode;
    }, mode);
    await page.getByRole('button', { name: 'Open linked moderation case' }).click();
    if (mode === 'success') {
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      expect(await page.evaluate(() => window.moduleFixture.reports)).toEqual([{ id: 'report' }]);
    } else if (mode === 'late') {
      await page.evaluate(() => {
        const f = window.moduleFixture;
        f.lock!();
        f.waits.report!.resolve({ id: 'report' });
      });
      expect(await page.evaluate(() => window.moduleFixture.reports)).toEqual([]);
    } else {
      await expect(page.locator('[data-feedback]')).toContainText(
        mode === 'wrong' ? 'identity could not be verified' : 'Linked report unavailable',
      );
      await expect(page.getByRole('button', { name: 'Open linked moderation case' })).toBeEnabled();
    }
  });
test('safety paging, closed filter, refresh and empty page preserve exact queue scope', async ({
  page,
}) => {
  await mount(page, 'safety', {
    view: 'moderation',
    item: {
      reason_label: null,
      detail_label: null,
      reason: null,
      detail: null,
      state: 'custom',
      received_at: null,
      deadline_at: null,
    },
  });
  await page.evaluate(async () => {
    window.moduleFixture.next = { at: 'time', id: 'cursor' };
    await window.moduleFixture.api!.reconcile();
  });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled();
  expect(await page.evaluate(() => window.moduleFixture.calls.at(-1)!.args)).toEqual([
    { at: 'time', id: 'cursor' },
    false,
    'moderation',
  ]);
  await page.getByRole('button', { name: 'Previous' }).click();
  await page.getByRole('button', { name: 'Show closed' }).click();
  await expect(page.getByRole('button', { name: 'Show open' })).toBeVisible();
  expect(await page.evaluate(() => window.moduleFixture.calls.at(-1)!.args)).toEqual([
    null,
    true,
    'moderation',
  ]);
  await page.evaluate(() => (window.moduleFixture.empty = true));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('table')).toContainText('No requests match this view.');
});
for (const mode of ['error', 'empty-error'])
  test(`safety ${mode} queue has explicit retry without false empty state`, async ({ page }) => {
    await mount(page, 'safety');
    await page.evaluate(async (mode) => {
      window.moduleFixture.modes.page = mode;
      await window.moduleFixture.api!.reconcile();
    }, mode);
    await expect(page.getByRole('alert')).toHaveText(
      mode === 'error' ? 'Synthetic service unavailable' : 'Requests unavailable.',
    );
    await page.evaluate(() => delete window.moduleFixture.modes.page);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('[data-case]')).toHaveCount(1);
  });
test('completed intimate-image removal requires copies and access verification and preserves exact workflow payload', async ({
  page,
}) => {
  await mount(page, 'safety');
  await open(page, 'safety');
  await select(page, '#safetyAction', 'removed');
  await expect(page.locator('#safetyCopies')).toHaveAttribute('required', '');
  await expect(page.locator('#safetyAccess')).toHaveAttribute('required', '');
  await page.locator('#safetyCopies').fill('Synthetic copy review.');
  await page.locator('#safetyAccess').fill('Synthetic old URL verification.');
  await workflow(page, 'removed');
  await expect(page.locator('dialog')).toContainText('does not itself remove content');
  await page.evaluate(() => (window.moduleFixture.modes.command = 'wrong'));
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(page.locator('[data-feedback]')).toContainText('Save could not be confirmed');
  expect(
    await page.evaluate(() => {
      const args=window.moduleFixture.calls.find((c) => c.name === 'command')!.args;
      if (!args || typeof args!=='object' || !('p_input' in args)) throw Error('Missing safety input');
      return args.p_input;
    }),
  ).toEqual({
    action: 'removed',
    note: 'Synthetic reviewed rationale.',
    message: 'Synthetic requester response.',
    copies_review: 'Synthetic copy review.',
    access_review: 'Synthetic old URL verification.',
  });
});
test('safety closed case allows reopening, not content identification', async ({ page }) => {
  await mount(page, 'safety', {
    item: { closed_at: '2026-10-01T12:00:00Z', state: 'not_actionable', history: null },
  });
  await open(page, 'safety');
  await expect(page.locator('#safetyAction')).toHaveValue('reopen');
  await expect(page.locator('[data-target]')).toHaveCount(0);
  await expect(page.locator('.safetyHistory')).toContainText('No workflow activity');
});
for (const result of ['success', 'error'])
  test(`safety late ${result} save cannot restore a locked case`, async ({ page }) => {
    await mount(page, 'safety');
    await open(page, 'safety');
    await workflow(page);
    await page.evaluate(() => (window.moduleFixture.modes.command = 'pending'));
    await page.getByRole('button', { name: 'Confirm change' }).click();
    await page.evaluate(() =>
      document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })),
    );
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.evaluate((result) => {
      const f = window.moduleFixture;
      f.lock!();
      if (result === 'success')
        f.waits.command!.resolve({ id: f.id, revision: 3, outcome: 'saved' });
      else f.waits.command!.reject(Error('Late failure'));
    }, result);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('.safetyQueue')).toBeEmpty();
  });
test('safety backdrop close restores trigger and a hidden view does not issue reconciliation reads', async ({
  page,
}) => {
  await mount(page, 'safety');
  await open(page, 'safety');
  await page.locator('dialog').dispatchEvent('pointerdown', { clientX: -1, clientY: -1 });
  await page.locator('dialog').dispatchEvent('pointerup', { clientX: -1, clientY: -1 });
  await expect(page.locator('[data-case]')).toBeFocused();
  const before = await page.evaluate(() => window.moduleFixture.calls.length);
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>('[data-portal-view=safety]')!.hidden = true;
    await window.moduleFixture.api!.reconcile();
  });
  expect(await page.evaluate(() => window.moduleFixture.calls.length)).toBe(before);
});

for (const operation of ['page', 'detail'])
  test(`safety late ${operation} response cannot restore locked data`, async ({ page }) => {
    await mount(page, 'safety');
    await page.evaluate((operation) => {
      window.moduleFixture.modes[operation] = 'pending';
      if (operation === 'page') window.moduleFixture.task = window.moduleFixture.api!.reconcile();
    }, operation);
    if (operation === 'detail') await page.locator('[data-case]').click();
    await expect
      .poll(() => page.evaluate((operation) => !!window.moduleFixture.waits[operation], operation))
      .toBe(true);
    await page.evaluate(async (operation) => {
      const f = window.moduleFixture;
      f.lock!();
      f.waits[operation]!.resolve(
        operation === 'page' ? { items: [f.item], next_cursor: null } : f.item,
      );
      if (f.task) await f.task;
    }, operation);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('.safetyQueue')).toBeEmpty();
  });
for (const kind of ['profile_photo', 'account'])
  test(`restricted ${kind} handoff explains no automatic removal and requires reviewed fingerprint`, async ({
    page,
  }) => {
    await mount(page, 'safety');
    await open(page, 'safety');
    await select(page, '#safetyKind', kind);
    await page.locator('#safetyTargetId').fill('11111111-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: 'Inspect content' }).click();
    await expect(page.locator('#safety-target-owner')).toHaveValue('synthetic-owner');
    await expect(page.locator('#safety-photo_ref')).toHaveValue('private/reference');
    await page.locator('#safetyHandoffNote').fill('Synthetic exact content verification.');
    await page.locator('[data-handoff] input[type=checkbox]').check();
    await page.getByRole('button', { name: 'Review report creation' }).click();
    await expect(page.locator('dialog')).toContainText(
      'without automatic account or photo removal',
    );
    expect(
      await page.evaluate(() => window.moduleFixture.calls.filter((c) => c.name === 'command').length),
    ).toBe(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('#safetyHandoffNote')).toHaveValue(
      'Synthetic exact content verification.',
    );
  });
test('changed safety target discards pending inspection and empty provider errors are retryable', async ({
  page,
}) => {
  await mount(page, 'safety');
  await open(page, 'safety');
  await page.evaluate(() => (window.moduleFixture.modes.target = 'pending'));
  await page.locator('#safetyTargetId').fill('11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'Inspect content' }).click();
  await page.locator('#safetyTargetId').fill('22222222-2222-4222-8222-222222222222');
  await page.evaluate(() => window.moduleFixture.waits.target!.resolve({ id: 'old-result' }));
  await expect(page.locator('[data-target-preview]')).toBeEmpty();
  await expect(page.getByRole('button', { name: 'Inspect content' })).toBeEnabled();
  await page.evaluate(() => (window.moduleFixture.modes.target = 'empty-error'));
  await page.getByRole('button', { name: 'Inspect content' }).click();
  await expect(page.locator('[data-feedback]')).toHaveText('Exact content unavailable.');
});
test('overlapping safety reconciliation coalesces and rejects unverified revisions', async ({
  page,
}) => {
  await mount(page, 'safety');
  await open(page, 'safety');
  await page.locator('#safetyNote').fill('Preserved review notes.');
  await page.evaluate(async () => {
    const f = window.moduleFixture;
    f.modes.page = 'pending';
    f.task = f.api!.reconcile();
    await f.api!.reconcile();
    await f.api!.reconcile();
  });
  await page.evaluate(async () => {
    const f = window.moduleFixture;
    delete f.modes.page;
    f.item!.revision = 'invalid';
    f.waits.page!.resolve({ items: [f.item], next_cursor: null });
    await f.task;
  });
  await expect(page.locator('[data-freshness]')).toContainText('Could not check');
  await expect(page.locator('#safetyNote')).toHaveValue('Preserved review notes.');
  expect(
    await page.evaluate(() => window.moduleFixture.calls.filter((c) => c.name === 'page').length),
  ).toBe(3);
});
