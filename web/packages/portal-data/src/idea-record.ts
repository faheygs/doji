import { ownership, record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';

const bad = () => Error('Idea record could not be verified. Reload before continuing.');
const text = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit;
export const ideaVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const states = ['pending', 'approved', 'rejected'];
export type IdeaAction = 'pending' | 'approved' | 'rejected';

/** Retain only fields rendered by this employee view, never an arbitrary server object. */
export function ideaRecord(value: unknown, id: string) {
  if (
    !uuid(id) ||
    !record(value) ||
    value.id !== id ||
    !ideaVersion(value.version) ||
    !text(value.body, 10000) ||
    !text(value.kind, 80) ||
    !states.includes(String(value.status)) ||
    typeof value.can_write !== 'boolean' ||
    !Array.isArray(value.allowed_actions) ||
    value.allowed_actions.length > 3 ||
    value.allowed_actions.some((action) => !states.includes(String(action))) ||
    !Array.isArray(value.recent_history) ||
    value.recent_history.length > 20
  )
    throw bad();
  const optional = (field: string, max = 2000) => {
    const v = value[field];
    if (v === null || v === undefined) return '';
    if (!text(v, max)) throw bad();
    return v;
  };
  const options: string[] = [];
  let supported = false;
  if (['poll', 'wyr'].includes(value.kind)) {
    supported =
      Array.isArray(value.options) &&
      value.options.length >= 2 &&
      value.options.length <= 8 &&
      (value.kind !== 'wyr' || value.options.length === 2) &&
      value.options.every((option) => text(option, 100) && !!option.trim());
    if (supported) options.push(...(value.options as string[]));
  } else if (
    value.kind === 'format_question' &&
    record(value.options) &&
    record(value.options.answer_rule)
  ) {
    const rule = value.options.answer_rule;
    if (
      rule.type === 'exact_word_count' &&
      Number.isInteger(rule.count) &&
      Number(rule.count) >= 1 &&
      Number(rule.count) <= 20
    ) {
      options.push(`Exactly ${rule.count} words`);
      supported = true;
    } else if (
      rule.type === 'starts_with_letter' &&
      typeof rule.letter === 'string' &&
      /^[A-Za-z]$/.test(rule.letter)
    ) {
      options.push(`Starts with ${rule.letter}`);
      supported = true;
    }
  } else
    supported =
      ['question', 'photo_idea'].includes(value.kind) &&
      Array.isArray(value.options) &&
      !value.options.length;
  const history = value.recent_history.map((entry) => {
    if (
      !record(entry) ||
      !text(entry.id, 80) ||
      !text(entry.action, 100) ||
      !text(entry.reason, 2000) ||
      !(entry.actor_role === null || text(entry.actor_role, 100)) ||
      !text(entry.occurred_at, 80) ||
      !Number.isFinite(Date.parse(entry.occurred_at))
    )
      throw bad();
    return {
      id: entry.id,
      action: entry.action,
      reason: entry.reason,
      role: entry.actor_role ?? '',
      at: entry.occurred_at,
    };
  });
  return {
    id,
    version: value.version,
    body: value.body,
    kind: value.kind,
    status: value.status as IdeaAction,
    canWrite: value.can_write,
    actions: [...value.allowed_actions] as IdeaAction[],
    options,
    supported,
    history,
    author: optional('author', 160),
    reviewer: optional('reviewer', 160),
    note: optional('admin_note'),
    blocked: optional('review_blocked_reason'),
    createdAt: optional('created_at', 80),
    scheduledAt: optional('scheduled_at', 80),
    challengeId: optional('challenge_id', 80),
    poolActive: value.pool_active === true,
  };
}
export async function readIdeaRecord(
  controller: EmployeeSessionController,
  id: string,
  signal: AbortSignal,
) {
  if (!uuid(id)) throw bad();
  const [idea, rawOwner] = await Promise.all([
    controller.read(
      'operations_read',
      '/portal/admin/editorial-item?kind=suggestions&id=' + id,
      undefined,
      (value) => ideaRecord(value, id),
      signal,
    ),
    controller.read(
      'operations_read',
      '/staff-workflow/ownership',
      { p_kind: 'suggestion', p_id: id },
      (value) => ownership(value, { kind: 'suggestion', id }),
      signal,
    ),
  ]);
  if (rawOwner.source_version !== idea.version) throw bad();
  const owner = {
    revision: rawOwner.revision,
    assignedTo: rawOwner.assigned_to,
    label: rawOwner.owner_label,
    canClaim: rawOwner.can_claim,
    canRelease: rawOwner.can_release,
    canAssign: rawOwner.can_assign,
    canDecide: rawOwner.can_decide,
    actionable: rawOwner.actionable,
  };
  return { idea, owner };
}
export type IdeaRecord = Awaited<ReturnType<typeof readIdeaRecord>>;
