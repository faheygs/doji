import { assignees, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';

export async function readBusinessAssignees(
  controller: EmployeeSessionController,
  id: string,
  after: string | null,
  signal: AbortSignal,
) {
  return readCaseAssignees(controller, 'business_application', id, after, signal);
}
export async function readCaseAssignees(
  controller: EmployeeSessionController,
  kind: 'business_application' | 'suggestion' | 'business_privacy' | 'appeal',
  id: string,
  after: string | null,
  signal: AbortSignal,
) {
  if (
    !['business_application', 'suggestion', 'business_privacy', 'appeal'].includes(kind) ||
    !uuid(id) ||
    (after !== null && !uuid(after)) ||
    controller.getSnapshot().operator?.capabilities[
      kind === 'appeal'
        ? 'moderation_read'
        : kind === 'suggestion'
          ? 'operations_read'
          : kind === 'business_privacy'
            ? 'legal_read'
            : 'business_read'
    ] !== true
  )
    throw Error('Case assignment access required.');
  return controller.read(
    'operator_manage',
    '/staff-workflow/assignees',
    {
      p_kind: kind,
      p_id: id,
      p_after_id: after,
      p_limit: 25,
    },
    (value) => {
      const page = assignees(value);
      if (
        new Set(page.items.map((x) => x.id)).size !== page.items.length ||
        page.items.some(
          (x, index) =>
            (after !== null && x.id <= after) || (index > 0 && x.id <= page.items[index - 1]!.id),
        ) ||
        (page.next_cursor !== null &&
          (page.next_cursor === after || page.next_cursor !== page.items.at(-1)?.id))
      )
        throw Error('Eligible reviewers could not be verified.');
      return {
        ...page,
        items: page.items.map((item) => ({
          id: item.id,
          label: item.label.slice(0, 160) || 'Employee',
        })),
      };
    },
    signal,
  );
}
