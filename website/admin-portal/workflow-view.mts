import {
  node,
  button,
  label,
  workKinds,
  type WorkRow,
  type WorkRef,
} from './workflow-contracts.mts';

export function workflowFilters(change: () => void) {
  const root = node('div', '', 'queueCommandBar');
  function field(title: string, id: string, values: readonly (readonly [string, string])[]) {
    const wrap = node('div', '', 'field'),
      caption = node('label', title),
      select = node('select');
    select.id = id;
    caption.htmlFor = id;
    values.forEach(([value, text]) => select.append(new Option(text, value)));
    select.onchange = change;
    wrap.append(caption, select);
    root.append(wrap);
    return select;
  }
  const source = field('Queue', 'staff-workflow-source', [
    ['all', 'All authorized queues'],
    ...workKinds.map((k) => [k, label(k)] as const),
  ]);
  const state = field('Work state', 'staff-workflow-state', [
    ['all', 'Ready and waiting'],
    ['ready', 'Ready for review'],
    ['waiting', 'Waiting on a response or execution'],
  ]);
  return { root, source, state };
}

export function workflowRow(
  item: WorkRow,
  actor: string,
  manage: (ref: WorkRef) => void,
  review: (ref: WorkRef) => void,
) {
  const row = node('tr');
  row.tabIndex = 0;
  row.setAttribute('aria-label', `Review ${item.subject}`);
  row.onclick = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('button,a,input,select')) return;
    review({ kind: item.kind, id: item.id });
  };
  row.onkeydown = (event) => {
    if (event.target === row && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      review({ kind: item.kind, id: item.id });
    }
  };
  const owner =
    item.assigned_to === null
      ? 'Unassigned'
      : item.assigned_to === actor
        ? 'Assigned to you'
        : 'Assigned to another employee';
  const overdue = item.work_state !== 'closed' && item.due_at !== null && Date.parse(item.due_at) <= Date.now();
  const due = item.due_at
    ? `${item.kind === 'report' ? (overdue ? 'Past internal target' : 'Internal target') : overdue ? 'Overdue assessed deadline' : 'Assessed deadline'}: ${new Date(item.due_at).toLocaleString()}`
    : 'No deadline set';
  [
    item.subject,
    item.origin ? `${label(item.kind)} · ${item.origin === 'external' ? 'External' : 'In-app'}` : label(item.kind),
    new Date(item.at).toLocaleString(),
    owner,
    item.work_state === 'closed' ? `Closed · ${item.status?.replaceAll('_', ' ') || 'Completed'}` : `${item.work_state === 'waiting' ? 'Waiting' : 'Ready for review'} · ${due}`,
  ].forEach((text, index) => {
    const cell = node('td', text);
    if (index === 4 && overdue) cell.classList.add('workflowOverdue');
    cell.dataset.label = ['Request', 'Queue', 'Received', 'Ownership', 'State / deadline'][index];
    row.append(cell);
  });
  const actions = node('td');
  actions.dataset.label = 'Actions';
  if (item.ownership_model === 'staff_workflow' && item.work_state !== 'closed')
    actions.append(button('Manage ownership', () => manage(item)));
  actions.append(button('Review request', () => review(item), true));
  row.append(actions);
  return row;
}

// Summarize only the authorized page already read, never infer global totals.
export function workflowPageSummary(items: WorkRow[], at: number) {
  const overdue = items.filter(
    (item) => item.due_at !== null && Date.parse(item.due_at) <= at,
  ).length;
  const waiting = items.filter((item) => item.work_state === 'waiting').length;
  const unassigned = items.filter((item) => item.assigned_to === null).length;
  return `On this page: ${overdue} past deadline or internal target · ${unassigned} unassigned · ${waiting} waiting. Checked ${new Date(at).toLocaleTimeString()}. Not queue-wide totals.`;
}

// Only hide superseded summaries while the feature-gated workspace exists.
// Dedicated domain review surfaces remain reachable and keep their own commands.
export function legacyWorkflowVisibility(hide: boolean) {
  document.body.classList.toggle('staffWorkflowEnabled', hide);
  for (const selector of [
    '[data-portal-view="inbox"] > .queuePanel',
    '[data-portal-view="inbox"] [data-action="claim-next"]',
    '#priorityQueue',
    '#queueHealth',
    '#unassignedMetric',
    '#urgentMetric',
    '#campaignMetric',
    '#inboxNavCount',
  ]) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el)
      ([
        'priorityQueue',
        'queueHealth',
        'unassignedMetric',
        'urgentMetric',
        'campaignMetric',
      ].includes(el.id)
        ? el.closest<HTMLElement>('article') || el
        : el
      ).hidden = hide;
  }
}
