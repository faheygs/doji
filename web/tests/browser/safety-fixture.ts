import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import { safetyFixture, safetyId, safetyActor } from '../safety-fixture';
import type { SafetyCommand } from '../../packages/portal-data/src/safety-command';
export { safetyId, safetyActor };
export async function installSafetyFixture(
  page: Page,
  request: APIRequestContext,
  mode = 'success',
  write = true,
  legal = true,
) {
  const base = await installBusinessFixture(page, request);
  const item = safetyFixture();
  item.can_write = write;
  const commands: SafetyCommand[] = [],
    reads: string[] = [];
  let deny = false,
    failRead = false;
  await page.route('https://admin.dojipro.com/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: safetyActor,
          display_name: 'Safety reviewer',
          capabilities: { moderation_read: true, moderation_write: write, legal_read: legal },
        },
      },
    }),
  );
  await page.route('https://admin.dojipro.com/api/rpc', async (route) => {
    const { name, args } = route.request().postDataJSON() as {
      name: string;
      args: Record<string, unknown>;
    };
    if (name === 'admin_safety_removal_command_v1') {
      const command = args as unknown as SafetyCommand;
      commands.push(command);
      if (mode === 'conflict')
        return route.fulfill({ status: 409, json: { message: 'Case changed' } });
      if (mode === 'uncertain' && commands.length === 1)
        return route.fulfill({ status: 503, json: {} });
      item.revision = command.p_revision + 1;
      if (command.p_input.action === 'claim') item.assigned_to = safetyActor;
      else item.state = command.p_input.action === 'reopen' ? 'reviewing' : command.p_input.action;
      item.closed_at = ['removed', 'not_actionable'].includes(item.state)
        ? new Date().toISOString()
        : null;
      if (command.p_input.message) item.public_message = command.p_input.message;
      return route.fulfill({ json: { id: safetyId, revision: item.revision, outcome: 'saved' } });
    }
    if (name === 'get_admin_safety_removal_v1') {
      reads.push(name);
      return route.fulfill({
        status: deny ? 403 : failRead ? 503 : 200,
        json: deny || failRead ? {} : item,
      });
    }
    if (name === 'get_admin_safety_work_page_v1' || name === 'get_admin_staff_work_page_v1')
      return route.fulfill({
        json: {
          scope: args.p_queue ? 'staff_safety_v1' : 'staff_inbox_v1',
          queue: args.p_queue,
          closed: false,
          order: 'oldest_first',
          authorized_queues: ['external_intake'],
          next_cursor: null,
          items: [
            {
              id: safetyId,
              kind: 'external_intake',
              key: 'external_intake:' + safetyId,
              subject: 'Synthetic removal request',
              at: item.received_at,
              due_at: item.deadline_at,
              assigned_to: args.p_filter === 'mine' ? safetyActor : item.assigned_to,
              work_state: 'ready',
              origin: 'external',
              status: item.state,
              ownership_model: 'existing_intake',
            },
          ],
        },
      });
    return route.fallback();
  });
  return {
    ...base,
    commands,
    reads,
    item,
    deny: () => {
      deny = true;
    },
    failRead: (value: boolean) => {
      failRead = value;
    },
  };
}
