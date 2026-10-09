import type { Page, APIRequestContext } from '@playwright/test';
import { installOfflineRealtime } from './offline-realtime';
import { releaseAsset } from './release-asset';

export const businessId = '20000000-0000-4000-8000-000000000002';
const actor = '10000000-0000-4000-8000-000000000001';
export async function installBusinessFixture(
  page: Page,
  request: APIRequestContext,
  mode = 'success',
  manager = false,
  announcementCompose = false,
) {
  await installOfflineRealtime(page);
  let signedIn = true,
    assigned = false,
    denied = false;
  const commands: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const external: string[] = [];
  let releaseCommand = () => {};
  const commandGate = new Promise<void>((resolve) => {
    releaseCommand = resolve;
  });
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://admin.dojipro.com') {
      external.push(url.origin);
      await route.abort();
      return;
    }
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (url.pathname === '/api/session') {
      await json(
        signedIn
          ? {
              signedIn: true,
              assurance: 'aal2',
              csrf: 'c'.repeat(43),
              operator: {
                user_id: actor,
                display_name: 'Synthetic reviewer',
                capabilities: { business_read: true, operator_manage: manager },
              },
            }
          : {},
        signedIn ? 200 : 401,
      );
      return;
    }
    if (url.pathname === '/auth/logout') {
      signedIn = false;
      await json({ signedIn: false });
      return;
    }
    if (url.pathname === '/api/rpc') {
      const { name, args } = route.request().postDataJSON() as {
        name: string;
        args: Record<string, unknown>;
      };
      if (!signedIn) {
        await json({}, 401);
        return;
      }
      if (name === 'admin_case_ownership_command_v1') {
        commands.push(args);
        if (mode === 'deferred') await commandGate;
        if (mode === 'conflict') {
          await json({ message: 'Assignment changed' }, 409);
          return;
        }
        assigned = true;
        if (mode === 'uncertain' && commands.length === 1) {
          await json({ message: 'Receipt unavailable' }, 503);
          return;
        }
        await json({
          id: businessId,
          kind: 'business_application',
          revision: 1,
          assigned_to: actor,
          replayed: commands.length > 1,
        });
        return;
      }
      reads.push(name);
      if (name === 'get_admin_staff_event_channels_v1') {
        await json([]);
        return;
      }
      if (denied) {
        await json({ message: 'Record unavailable' }, 403);
        return;
      }
      if (name === 'get_admin_staff_work_page_v1') {
        await json({
          scope: 'staff_inbox_v1',
          order: 'oldest_first',
          authorized_queues: ['business_application'],
          next_cursor: null,
          items:
            args.p_filter === 'mine' && !assigned
              ? []
              : [
                  {
                    kind: 'business_application',
                    id: businessId,
                    key: 'business_application:' + businessId,
                    subject: 'Synthetic business',
                    at: '2026-10-08T12:00:00Z',
                    assigned_to: assigned ? actor : null,
                    work_state: 'ready',
                    due_at: null,
                    ownership_model: 'staff_workflow',
                  },
                ],
        });
        return;
      }
      if (name === 'get_admin_business_application_v1') {
        await json({
          id: businessId,
          revision: 3,
          state: 'pending',
          details: {
            brand_name: 'Synthetic business',
            legal_name: 'Synthetic company',
            country: 'US',
            purpose: 'A safe fixture for application review.',
            website: 'https://example.com',
            representative_name: 'Fixture applicant',
            representative_role: 'Owner',
            category: 'Technology',
          },
          latest_submission: { submission: 1, terms_version: 'v1', privacy_version: 'v1' },
          history: [
            {
              revision: 3,
              action: 'submit',
              response: '',
              internal_note: 'Synthetic review history',
              occurred_at: '2026-10-08T12:00:00Z',
            },
          ],
          history_has_more: false,
        });
        return;
      }
      if (name === 'get_admin_case_ownership_v1') {
        await json({
          id: businessId,
          kind: 'business_application',
          revision: assigned ? 1 : 0,
          source_version: '3',
          assigned_to: assigned ? actor : null,
          owner_label: assigned ? 'Synthetic reviewer' : 'Unassigned',
          can_claim: !assigned,
          can_release: assigned,
          can_assign: false,
          can_decide: false,
          actionable: true,
        });
        return;
      }
      await json({ message: 'Unexpected RPC' }, 403);
      return;
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      await json({}, 404);
      return;
    }
    const staged = await releaseAsset(url.pathname);
    if (staged) {
      await route.fulfill(staged);
      return;
    }
    const asset = await request.get('http://127.0.0.1:4310' + url.pathname + url.search);
    if (url.pathname === '/connected.html')
      await route.fulfill({
        contentType: 'text/html',
        body: (await asset.text()).replace(
          '<head>',
          '<head><script>window.DOJI_REACT_ADMIN_CONFIG={independentEmployeeIdentity:true,staffWorkflowEnabled:true,businessApplicationsEnabled:true,announcementComposeEnabled:' +
            JSON.stringify(announcementCompose) +
            '};</script>',
        ),
      });
    else await route.fulfill({ response: asset });
  });
  return {
    commands,
    reads,
    external,
    releaseCommand,
    assignExternally: () => {
      assigned = true;
    },
    deny: () => {
      denied = true;
    },
  };
}
