import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture, businessId } from './business-fixture';

export const reviewerA = '40000000-0000-4000-8000-000000000004';
export const reviewerB = '50000000-0000-4000-8000-000000000005';
const actor = '10000000-0000-4000-8000-000000000001';
export async function installOwnershipFixture(
  page: Page,
  request: APIRequestContext,
  mode = 'success',
  manager = true,
) {
  const base = await installBusinessFixture(page, request, 'success', manager);
  let owner: string | null = actor,
    revision = 1;
  const commands: Record<string, unknown>[] = [],
    directory: Record<string, unknown>[] = [];
  const receipts = new Map<string, unknown>();
  await page.route('**/api/rpc', async (route) => {
    const { name, args } = route.request().postDataJSON() as {
      name: string;
      args: Record<string, unknown>;
    };
    if (name === 'get_admin_case_ownership_v1') {
      await route.fulfill({
        json: {
          id: businessId,
          kind: 'business_application',
          revision,
          source_version: '3',
          assigned_to: owner,
          owner_label:
            owner === actor
              ? 'Synthetic reviewer'
              : owner === reviewerA
                ? 'Reviewer A'
                : owner === reviewerB
                  ? 'Reviewer B'
                  : 'Unassigned',
          can_claim: owner === null,
          can_release: owner !== null && (owner === actor || manager),
          can_assign: manager,
          can_decide: manager,
          actionable: true,
        },
      });
      return;
    }
    if (name === 'get_admin_case_assignees_v1') {
      directory.push(args);
      await route.fulfill({
        json:
          args.p_after_id === null
            ? { items: [{ id: reviewerA, label: 'Reviewer A' }], next_cursor: reviewerA }
            : { items: [{ id: reviewerB, label: 'Reviewer B' }], next_cursor: null },
      });
      return;
    }
    if (name !== 'admin_case_ownership_command_v1') {
      await route.fallback();
      return;
    }
    commands.push(args);
    if (mode === 'conflict') {
      await route.fulfill({ status: 409, json: { message: 'Ownership changed' } });
      return;
    }
    const key = String(args.p_request_id);
    const existing = receipts.get(key);
    if (!existing) {
      owner = args.p_action === 'claim' ? actor : (args.p_target as string | null);
      revision++;
      receipts.set(key, {
        id: businessId,
        kind: 'business_application',
        revision,
        assigned_to: owner,
        replayed: false,
      });
    }
    if (mode === 'uncertain' && commands.length === 1) {
      await route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
      return;
    }
    await route.fulfill({ json: { ...(receipts.get(key) as object), replayed: !!existing } });
  });
  return {
    ...base,
    commands,
    directory,
    change: () => {
      revision++;
      owner = reviewerB;
    },
  };
}
