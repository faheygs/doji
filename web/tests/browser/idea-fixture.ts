import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import { ideaId, ideaActor, ideaFixture, ideaOwner } from '../idea-fixture';
export const ideaUrl = 'https://admin.dojipro.com/connected.html#/community-ideas/' + ideaId;
export async function installIdeaFixture(page: Page, request: APIRequestContext, manager = true) {
  const base = await installBusinessFixture(page, request);
  const item = ideaFixture(),
    owner = ideaOwner();
  let fail = false;
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: ideaActor,
          display_name: 'Synthetic reviewer',
          capabilities: { operations_read: true, operator_manage: manager },
        },
      },
    }),
  );
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as (typeof writes)[number];
    if (call.name === 'get_admin_editorial_item_v1') return route.fulfill({ json: item });
    if (call.name === 'get_admin_case_ownership_v1') return route.fulfill({ json: owner });
    if (call.name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    if (call.name === 'admin_case_ownership_command_v1') {
      writes.push(call);
      Object.assign(owner, ideaOwner(call.args.p_action === 'claim'));
      return route.fulfill({
        json: {
          id: ideaId,
          kind: 'suggestion',
          revision: Number(call.args.p_revision) + 1,
          assigned_to: owner.assigned_to,
          replayed: false,
        },
      });
    }
    if (call.name === 'admin_editorial_command_v1') {
      writes.push(call);
      Object.assign(item, {
        status: call.args.p_action,
        version: 'b'.repeat(32),
        allowed_actions: ['pending', 'rejected'],
      });
      Object.assign(owner, {
        source_version: item.version,
        can_release: false,
        can_claim: false,
        can_decide: false,
        actionable: false,
      });
      if (fail) {
        fail = false;
        return route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
      }
      return route.fulfill({ json: item });
    }
    return route.fulfill({ status: 403, json: { message: 'Unexpected RPC' } });
  });
  return {
    ...base,
    item,
    owner,
    writes,
    failOnce: () => {
      fail = true;
    },
  };
}
