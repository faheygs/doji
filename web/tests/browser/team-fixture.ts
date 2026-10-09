import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import { teamActor, teamFixture } from '../team-fixture';
export async function installTeamFixture(page: Page, request: APIRequestContext, allowed = true) {
  await installBusinessFixture(page, request);
  let manager = allowed,
    signedIn = true,
    failure = false,
    uncertain = false,
    rejected = false,
    revokeSelf = false;
  const directory = teamFixture(),
    calls: { name: string; args: Record<string, unknown> }[] = [];
  await page.route('**/api/session', (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      json: {
        signedIn,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: teamActor,
          display_name: 'Synthetic manager',
          capabilities: { operations_read: true, operator_manage: manager },
        },
      },
    }),
  );
  await page.route('**/auth/logout', (route) => {
    signedIn = false;
    return route.fulfill({ json: { signedOut: true } });
  });
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as (typeof calls)[number];
    calls.push(call);
    if (call.name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    if (call.name === 'get_admin_employee_directory_v1')
      return route.fulfill({
        status: failure ? 503 : 200,
        json: failure ? { message: 'Unavailable' } : directory,
      });
    if (call.name === 'admin_set_employee_role_v1') {
      if (rejected)
        return route.fulfill({ status: 403, json: { message: 'Last administrator protected' } });
      if (uncertain) {
        uncertain = false;
        return route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
      }
      if (revokeSelf) manager = false;
      return route.fulfill({
        json: {
          status: call.args.p_active ? 'active' : 'disabled',
          roles: call.args.p_active ? [call.args.p_role] : [],
          changed_role: call.args.p_role,
          granted: call.args.p_active,
        },
      });
    }
    return route.fulfill({ status: 403, json: { message: 'Unexpected RPC' } });
  });
  return {
    calls,
    directory,
    fail: () => {
      failure = true;
    },
    uncertain: () => {
      uncertain = true;
    },
    reject: () => {
      rejected = true;
    },
    revokeSelf: () => {
      revokeSelf = true;
    },
  };
}
