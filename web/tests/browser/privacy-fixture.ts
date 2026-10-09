import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import { releaseAsset } from './release-asset';
import { privacyActor, privacyFixture, privacyId, privacyOwnership } from '../privacy-fixture';
export const privacyUrl = 'https://admin.dojipro.com/connected.html#/business-privacy';
export async function installPrivacyFixture(
  page: Page,
  request: APIRequestContext,
  manager = true,
) {
  const base = await installBusinessFixture(page, request);
  let denied = false,
    signedIn = true;
  const data = privacyFixture();
  const owner = privacyOwnership();
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  await page.route('**/connected.html', async (route) => {
    const staged = await releaseAsset('/connected.html');
    if (staged) return route.fulfill(staged);
    const asset = await request.get('http://127.0.0.1:4310/connected.html');
    await route.fulfill({
      contentType: 'text/html',
      body: (await asset.text()).replace(
        '<head>',
        '<head><script>window.DOJI_REACT_ADMIN_CONFIG={independentEmployeeIdentity:true,staffWorkflowEnabled:true,businessPrivacyEnabled:true};</script>',
      ),
    });
  });
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: signedIn
        ? {
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: {
              user_id: privacyActor,
              display_name: 'Privacy reviewer',
              capabilities: { legal_read: true, operator_manage: manager },
            },
          }
        : {},
      status: signedIn ? 200 : 401,
    }),
  );
  await page.route('**/auth/logout', (route) => {
    signedIn = false;
    return route.fulfill({ json: { signedIn: false } });
  });
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as (typeof calls)[number];
    calls.push(call);
    const json = (body: unknown) => route.fulfill({ json: body });
    if (call.name === 'get_admin_staff_event_channels_v1') return json([]);
    if (denied)
      return route.fulfill({ status: 403, json: { message: 'Privacy record unavailable' } });
    if (call.name === 'get_admin_business_privacy_page_v1')
      return json(
        call.args.p_after_id
          ? []
          : Array.from({ length: 25 }, (_, i) => ({
              ...data,
              id: i === 0 ? privacyId : `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
              state: call.args.p_state,
            })),
      );
    if (call.name === 'get_admin_business_privacy_case_v1')
      return json({
        ...data,
        history: privacyFixture(Number(call.args.p_after_revision), data.revision).history,
        history_has_more: Number(call.args.p_after_revision) + 30 < data.revision,
        state: data.state,
        hold: data.hold,
        id: call.args.p_case_id,
        verification_reference: data.verification_reference,
      });
    if (call.name === 'get_admin_case_ownership_v1')
      return json({ ...owner, source_version: String(data.revision), id: call.args.p_id });
    if (call.name === 'get_admin_staff_work_page_v1')
      return json({
        scope: 'staff_inbox_v1',
        order: 'oldest_first',
        authorized_queues: ['business_privacy'],
        next_cursor: null,
        items: [
          {
            kind: 'business_privacy',
            id: privacyId,
            key: 'business_privacy:' + privacyId,
            subject: 'Business privacy request',
            at: data.received_at,
            assigned_to: privacyActor,
            work_state: 'ready',
            due_at: data.due_at,
            ownership_model: 'staff_workflow',
          },
        ],
      });
    return route.fulfill({ status: 403, json: { message: 'Unexpected RPC' } });
  });
  return {
    ...base,
    calls,
    data,
    owner,
    deny: () => {
      denied = true;
    },
  };
}
