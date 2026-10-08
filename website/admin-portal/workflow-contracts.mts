export const workKinds = [
  'report',
  'appeal',
  'suggestion',
  'business_application',
  'external_intake',
  'business_privacy',
] as const;
export type WorkKind = (typeof workKinds)[number];
export type WorkflowRequest = (
  path: 'inbox' | 'safety' | 'ownership' | 'command' | 'assignees',
  body: Record<string, unknown>,
) => Promise<unknown>;
export interface WorkRef {
  kind: WorkKind;
  id: string;
}
export interface WorkRow extends WorkRef {
  key: string;
  subject: string;
  at: string;
  assigned_to: string | null;
  work_state: 'ready' | 'waiting' | 'closed';
  origin?: 'in_app' | 'external';
  status?: string;
  due_at: string | null;
  ownership_model: 'staff_workflow' | 'existing_report' | 'existing_intake';
}
export interface WorkPage {
  items: WorkRow[];
  next_cursor: { at: string; key: string } | null;
  authorized_queues: WorkKind[];
}
export interface Ownership extends WorkRef {
  revision: number;
  source_version: string;
  owner_label: string;
  assigned_to: string | null;
  can_claim: boolean;
  can_release: boolean;
  can_assign: boolean;
  can_decide: boolean;
  actionable: boolean;
}
export const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export const kind = (value: unknown): value is WorkKind => workKinds.some((k) => k === value);
const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export const label = (value: WorkKind) =>
  ({
    report: 'Content report',
    appeal: 'Moderation appeal',
    suggestion: 'Community idea',
    business_application: 'Business application',
    external_intake: 'External removal request',
    business_privacy: 'Business privacy request',
  })[value];
export const invalid = () =>
  Error('The response could not be verified. Refresh before continuing.');
export function ownership(value: unknown, ref: WorkRef): Ownership {
  if (
    !record(value) ||
    value.id !== ref.id ||
    value.kind !== ref.kind ||
    !revision(value.revision) ||
    typeof value.source_version !== 'string' ||
    !value.source_version ||
    value.source_version.length > 64 ||
    typeof value.owner_label !== 'string' ||
    (value.assigned_to !== null && !uuid(value.assigned_to)) ||
    ['can_claim', 'can_release', 'can_assign', 'can_decide', 'actionable'].some(
      (k) => typeof value[k] !== 'boolean',
    )
  )
    throw invalid();
  return value as unknown as Ownership;
}
export function workPage(value: unknown, safety?: { queue: string; closed: boolean }): WorkPage {
  if (
    !record(value) ||
    value.scope !== (safety ? 'staff_safety_v1' : 'staff_inbox_v1') ||
    (safety && (value.queue !== safety.queue || value.closed !== safety.closed)) ||
    value.order !== 'oldest_first' ||
    !Array.isArray(value.items) ||
    value.items.length > 25 ||
    !Array.isArray(value.authorized_queues) ||
    !value.authorized_queues.every(kind) ||
    new Set(value.authorized_queues).size !== value.authorized_queues.length ||
    value.items.some(
      (row) =>
        !record(row) ||
        !kind(row.kind) ||
        !uuid(row.id) ||
        row.key !== `${row.kind}:${row.id}` ||
        !(value.authorized_queues as unknown[]).includes(row.kind) ||
        typeof row.subject !== 'string' ||
        row.subject.length > 120 ||
        typeof row.at !== 'string' ||
        !Number.isFinite(Date.parse(row.at)) ||
        !(safety?.closed ? ['closed'] : ['ready', 'waiting']).includes(String(row.work_state)) ||
        (safety && (!['report', 'appeal', 'external_intake'].includes(String(row.kind)) ||
          row.origin !== (row.kind === 'external_intake' ? 'external' : 'in_app') ||
          typeof row.status !== 'string' || row.status.length > 40)) ||
        (row.due_at !== null &&
          (typeof row.due_at !== 'string' || !Number.isFinite(Date.parse(row.due_at)))) ||
        row.ownership_model !==
          (row.kind === 'report'
            ? 'existing_report'
            : row.kind === 'external_intake'
              ? 'existing_intake'
              : 'staff_workflow') ||
        (row.assigned_to !== null && !uuid(row.assigned_to)),
    )
  )
    throw invalid();
  const rows = value.items as WorkRow[];
  if (new Set(rows.map((r) => r.key)).size !== rows.length) throw invalid();
  const cursor = value.next_cursor;
  if (
    cursor !== null &&
    (!record(cursor) ||
      cursor.at !== rows.at(-1)?.at ||
      cursor.key !== rows.at(-1)?.key ||
      !rows.length)
  )
    throw invalid();
  return value as unknown as WorkPage;
}
export function assignees(value: unknown) {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 25 ||
    value.items.some((x) => !record(x) || !uuid(x.id) || typeof x.label !== 'string') ||
    (value.next_cursor !== null && !uuid(value.next_cursor))
  )
    throw invalid();
  return value as { items: { id: string; label: string }[]; next_cursor: string | null };
}
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const el = document.createElement(tag);
  el.textContent = text;
  el.className = className;
  return el;
}
export function button(text: string, action: () => void, primary = false) {
  const el = node('button', text, `portalButton compact${primary ? ' primary' : ''}`);
  el.type = 'button';
  el.onclick = action;
  return el;
}
export function status(root: HTMLElement) {
  const el = node('p', '', 'portalFormStatus');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  root.append(el);
  return el;
}
