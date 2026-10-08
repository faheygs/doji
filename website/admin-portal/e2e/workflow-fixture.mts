import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  readBrowserSource,
  browserSourcePath,
  compileBrowserSource,
} from '../../browser-source.mts';
import { instrument } from '../../../scripts/coverage-instrument.mts';
import type { createWorkflowWorkspace } from '../workflow-workspace.mts';
import type { WorkRef } from '../workflow-contracts.mts';
export const businessId = '99000000-0000-4000-8000-000000000002';
export const ideaId = '99000000-0000-4000-8000-000000000001';
export const actorId = '98000000-0000-4000-8000-000000000001';
function source(asset: string) {
  const file = browserSourcePath(asset);
  return process.env.DOJI_BROWSER_COVERAGE === '1'
    ? compileBrowserSource(asset, instrument(readFileSync(file, 'utf8'), file).code)
    : readBrowserSource(asset);
}
declare global {
  interface Window {
    workflowTest: {
      module: ReturnType<typeof createWorkflowWorkspace>;
      epoch: number;
      active: boolean;
      calls: { path: string; body: Record<string, unknown> }[];
      reviews: WorkRef[];
      revision: number;
      owner: string | null;
      sourceVersion: string;
      failure: number;
      failPage: boolean;
      wrongIdentity: boolean;
      canAssign: boolean;
      canDecide: boolean;
      queues: string[];
      denial?: { path: string; status: number };
      release?: () => void;
      block?: Promise<void>;
    };
  }
}
export async function mount(page: Page, { canAssign = true, canDecide = true, team = true, safety = false } = {}) {
  const origin = 'https://admin.dojipro.com';
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="en" data-theme="light"><head><title>Staff workflow fixture</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/portal.css"><link rel="stylesheet" href="/admin-portal/admin.css"></head><body class="adminPortalPage"><main><h1>Command center</h1><section data-portal-view="overview"><div class="viewIntro"><h2>Review work</h2></div></section><section data-portal-view="inbox" hidden></section><section data-portal-view="other" hidden></section></main><script src="/portal-select.js"></script></body></html>`,
      });
    if (
      /^\/admin-portal\/workflow-(contracts|case|workspace|view|review|events)\.js$/.test(url.pathname) ||
      url.pathname === '/portal-select.js'
    )
      return route.fulfill({
        contentType: 'application/javascript',
        body: source(url.pathname.slice(1)),
      });
    if (
      ['/styles.css', '/portal.css', '/admin-portal/admin.css'].includes(url.pathname) ||
      url.pathname.startsWith('/assets/')
    ) {
      try {
        return route.fulfill({
          contentType: extname(url.pathname) === '.css' ? 'text/css' : undefined,
          body: await readFile(resolve('website', '.' + url.pathname)),
        });
      } catch {
        return route.abort();
      }
    }
    return route.abort();
  });
  await page.goto(origin);
  await page.evaluate(
    async ({ businessId, ideaId, actorId, canAssign, canDecide, safety }) => {
      const { createWorkflowWorkspace } = (await import(
        '/admin-portal/workflow-workspace.js' as string
      )) as typeof import('../workflow-workspace.mts');
      const state = {
        epoch: 1,
        active: true,
        calls: [],
        reviews: [],
        revision: 0,
        owner: null,
        sourceVersion: 'source-v1',
        failure: 0,
        failPage: false,
        wrongIdentity: false,
        canAssign,
        canDecide,
        queues: [
          'suggestion',
          'business_application',
          'appeal',
          'report',
          'external_intake',
          'business_privacy',
        ],
      } as unknown as Window['workflowTest'];
      window.workflowTest = state;
      const rows = [
        {
          id: businessId,
          kind: 'business_application',
          subject: 'Northstar',
          at: '2026-10-05T01:00:00Z',
          work_state: 'ready',
          due_at: null,
          ownership_model: 'staff_workflow',
        },
        {
          id: ideaId,
          kind: 'suggestion',
          subject: 'A community poll',
          at: '2026-10-05T02:00:00Z',
          work_state: 'ready',
          due_at: null,
          ownership_model: 'staff_workflow',
        },
        ...['report', 'appeal', 'external_intake', 'business_privacy'].map((kind, i) => ({
          id: `99000000-0000-4000-8000-00000000000${i + 3}`,
          kind,
          subject: `Synthetic ${kind}`,
          at: `2026-10-05T0${i + 3}:00:00Z`,
          work_state: kind === 'business_privacy' ? 'waiting' : 'ready',
          due_at: kind === 'external_intake' ? '2026-10-07T00:00:00Z' : null,
          ownership_model:
            kind === 'report'
              ? 'existing_report'
              : kind === 'external_intake'
                ? 'existing_intake'
                : 'staff_workflow',
        })),
      ];
      state.module = createWorkflowWorkspace({
        unifiedSafety: safety,
        epoch: () => state.epoch,
        active: () => state.active,
        actor: () => actorId,
        review: async (ref) => {
          state.reviews.push(ref);
        },
        enhance: (root) =>
          root.querySelectorAll('select').forEach((s) => window.DojiPortalSelect.enhance(s, true)),
        request: async (path, body) => {
          state.calls.push({ path, body: structuredClone(body) });
          if (state.block) await state.block;
          if (state.denial?.path === path)
            throw Object.assign(Error('synthetic access denied'), { status: state.denial.status });
          if (path === 'safety') {
            if (state.failPage) throw Error('synthetic unavailable');
            return { scope: 'staff_safety_v1', order: 'oldest_first', queue: body.p_queue,
              closed: body.p_closed, authorized_queues: ['report', 'appeal', 'external_intake'], next_cursor: null,
              items: rows.filter(r => ['report', 'appeal', 'external_intake'].includes(r.kind))
                .filter(r => body.p_kind === 'all' || body.p_kind === r.kind)
                .map(r => ({ ...r, key: `${r.kind}:${r.id}`, assigned_to: state.owner,
                  origin: r.kind === 'external_intake' ? 'external' : 'in_app', status: body.p_closed ? 'resolved' : 'pending',
                  work_state: body.p_closed ? 'closed' : 'ready', due_at: null })) };
          }
          if (path === 'inbox') {
            if (state.failPage) throw Error('synthetic unavailable');
            return {
              scope: 'staff_inbox_v1',
              order: 'oldest_first',
              authorized_queues: state.queues,
              next_cursor: null,
              items: rows
                .filter(
                  (r) =>
                    state.queues.includes(r.kind) &&
                    (body.p_state === 'all' || body.p_state === r.work_state),
                )
                .filter((r) => body.p_kind === 'all' || body.p_kind === r.kind)
                .filter(
                  () =>
                    body.p_filter === 'all' ||
                    (body.p_filter === 'mine' ? state.owner === actorId : state.owner === null),
                )
                .map((r) => ({
                  ...r,
                  key: `${r.kind}:${r.id}`,
                  revision: state.revision,
                  assigned_to: state.owner,
                })),
            };
          }
          if (path === 'ownership')
            return {
              ...body,
              kind: body.p_kind,
              id: state.wrongIdentity ? ideaId : body.p_id,
              revision: state.revision,
              source_version: state.sourceVersion,
              assigned_to: state.owner,
              owner_label: state.owner ? 'Synthetic employee' : 'Unassigned',
              actionable: true,
              can_claim: !state.owner,
              can_release: !!state.owner,
              can_assign: state.canAssign,
              can_decide: state.canDecide,
            };
          if (path === 'assignees')
            return { items: [{ id: actorId, label: 'Synthetic employee' }], next_cursor: null };
          if (state.failure)
            throw Object.assign(Error('synthetic command failure'), { status: state.failure });
          state.revision++;
          state.owner = body.p_action === 'claim' ? actorId : (body.p_target as string | null);
          return {
            kind: body.p_kind,
            id: body.p_id,
            revision: state.revision,
            assigned_to: state.owner,
            replayed: false,
          };
        },
      });
      document.querySelector<HTMLElement>('[data-portal-view="overview"]')!.hidden = true;
      document.querySelector<HTMLElement>('[data-portal-view="inbox"]')!.hidden = false;
      document.querySelector<HTMLElement>('[data-portal-view="inbox"]')!.innerHTML = '<div class="viewIntro"><h2>My work</h2></div>';
      for (const view of ['moderation', 'safety']) {
        const section = document.createElement('section');
        section.dataset.portalView = view; section.hidden = true;
        section.innerHTML = `<div class="viewIntro"><h2>${view}</h2></div><article class="queuePanel">Legacy table</article><div class="queueSummaryStrip">Legacy totals</div>`;
        document.querySelector('main')!.append(section);
      }
      state.module.reconcile();
    },
    { businessId, ideaId, actorId, canAssign, canDecide, safety },
  );
  if (team) {
    await page.getByRole('button', { name: 'Team work', exact: true }).click();
  }
}
