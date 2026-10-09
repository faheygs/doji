import type { Page, APIRequestContext } from '@playwright/test';
import { businessId, installBusinessFixture } from './business-fixture';

export async function installDecisionFixture(
  page: Page,
  request: APIRequestContext,
  mode = 'success',
  initial = 'pending',
  manager = true,
) {
  const base = await installBusinessFixture(page, request, 'success', manager);
  const decisions: Record<string, unknown>[] = [];
  let revision = 3,
    state = initial;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const application = () => ({
    id: businessId,
    revision,
    state,
    details: { brand_name: 'Synthetic business', purpose: 'Synthetic application review.' },
    latest_submission: { submission: 1, terms_version: 'v1', privacy_version: 'v1' },
    history: [],
    history_has_more: false,
  });
  await page.route('**/api/rpc', async (route) => {
    const { name, args } = route.request().postDataJSON() as {
      name: string;
      args: Record<string, unknown>;
    };
    if (name === 'get_admin_business_application_v1') {
      await route.fulfill({ json: application() });
      return;
    }
    if (name === 'get_admin_case_ownership_v1') {
      await route.fulfill({
        json: {
          id: businessId,
          kind: 'business_application',
          revision: 1,
          source_version: String(revision),
          assigned_to: '10000000-0000-4000-8000-000000000001',
          owner_label: 'Synthetic reviewer',
          can_claim: false,
          can_release: state === 'pending',
          can_assign: manager && state === 'pending',
          can_decide: manager && state === 'pending',
          actionable: state === 'pending',
        },
      });
      return;
    }
    if (name !== 'admin_business_application_command_v1') {
      await route.fallback();
      return;
    }
    decisions.push(args);
    if (mode === 'unconfirmed' && decisions.length === 1) {
      await route.fulfill({ status: 503, json: { message: 'Outcome unknown' } });
      return;
    }
    if (mode === 'deferred') await gate;
    if (mode === 'conflict') {
      await route.fulfill({ status: 409, json: { message: 'Application changed' } });
      return;
    }
    const outcomeState =
      args.p_action === 'approve'
        ? 'approved'
        : args.p_action === 'decline'
          ? 'declined'
          : 'changes_requested';
    state = outcomeState;
    revision = Number(args.p_revision) + 1;
    if (mode === 'uncertain' && decisions.length === 1) {
      await route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
      return;
    }
    await route.fulfill({
      json: {
        outcome: { id: businessId, revision, state, action: args.p_action },
        application: application(),
        replayed: decisions.length > 1,
      },
    });
  });
  return {
    ...base,
    decisions,
    release,
    change: () => {
      revision++;
    },
  };
}
