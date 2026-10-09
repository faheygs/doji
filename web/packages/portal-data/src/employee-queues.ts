import { workPage, type WorkPage } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeOperator, EmployeeSessionController } from './employee-session';

export const queueDefinitions = {
  'my-work': { label: 'My work', capability: null, queue: null, kind: 'all' },
  'trust-safety': {
    label: 'Trust & safety',
    capability: 'moderation_read',
    queue: 'moderation',
    kind: 'all',
  },
  'restricted-safety': {
    label: 'Restricted safety',
    capability: 'legal_read',
    queue: 'restricted_safety',
    kind: 'all',
  },
  'community-ideas': {
    label: 'Community ideas',
    capability: 'operations_read',
    queue: null,
    kind: 'suggestion',
  },
  businesses: {
    label: 'Business applications',
    capability: 'business_read',
    queue: null,
    kind: 'business_application',
  },
  'business-privacy': {
    label: 'Business privacy',
    capability: 'legal_read',
    queue: null,
    kind: 'business_privacy',
  },
} as const;
export type EmployeeQueue = keyof typeof queueDefinitions;
export type QueueCursor = WorkPage['next_cursor'];
export type { WorkPage, WorkRow } from '../../../../website/admin-portal/workflow-contracts.mts';
const readCapabilities = ['moderation_read', 'operations_read', 'business_read', 'legal_read'];
/** One existing bounded inbox read, not one request per tile or an aggregate count. */
export function readEmployeeOverview(controller: EmployeeSessionController, signal: AbortSignal) {
  const actor = controller.getSnapshot().operator;
  const capability = actor && readCapabilities.find((key) => actor.capabilities[key] === true);
  if (!capability) return Promise.reject(Error('Employee permission required.'));
  return controller.read(
    capability,
    '/staff-workflow/inbox',
    {
      p_kind: 'all',
      p_filter: 'all',
      p_limit: 25,
      p_after_at: null,
      p_after_key: null,
      p_state: 'all',
    },
    (value) => workPage(value),
    signal,
  );
}
export function canReadQueue(actor: EmployeeOperator, area: EmployeeQueue) {
  const definition = queueDefinitions[area];
  const capabilities = actor.capabilities;
  if (area === 'restricted-safety' && capabilities.moderation_read !== true) return false;
  if (area === 'business-privacy' && capabilities.operator_manage !== true) return false;
  return definition.capability
    ? capabilities[definition.capability] === true
    : readCapabilities.some((name) => capabilities[name] === true);
}
export function readEmployeeQueue(
  controller: EmployeeSessionController,
  area: EmployeeQueue,
  cursor: QueueCursor,
  signal: AbortSignal,
  closed = false,
) {
  const actor = controller.getSnapshot().operator;
  if (!actor || !canReadQueue(actor, area))
    return Promise.reject(Error('Employee permission required.'));
  const { queue, kind, capability } = queueDefinitions[area];
  if (typeof closed !== 'boolean' || (closed && !queue))
    return Promise.reject(Error('Unsupported queue state.'));
  const body = {
    p_kind: kind,
    p_filter: area === 'my-work' ? 'mine' : 'all',
    p_limit: 25,
    p_after_at: cursor?.at ?? null,
    p_after_key: cursor?.key ?? null,
    ...(queue ? { p_queue: queue, p_closed: closed } : { p_state: 'all' }),
  };
  return controller.read(
    capability ?? readCapabilities.find((name) => actor.capabilities[name])!,
    queue ? '/staff-workflow/safety' : '/staff-workflow/inbox',
    body,
    (value) => {
      const result = workPage(value, queue ? { queue, closed } : undefined);
      if (area === 'my-work' && result.items.some((row) => row.assigned_to !== actor.user_id))
        throw Error('Personal queue response could not be verified.');
      if (kind !== 'all' && result.items.some((row) => row.kind !== kind))
        throw Error('Queue scope could not be verified.');
      return result;
    },
    signal,
  );
}
