import {
  workPage,
  node,
  button,
  status,
  record,
  type WorkRef,
  type WorkflowRequest,
} from './workflow-contracts.mts';
import { createWorkflowCase } from './workflow-case.mts';
import { workflowInvalidator } from './workflow-events.mts';
import {
  workflowFilters,
  workflowRow,
  workflowPageSummary,
  legacyWorkflowVisibility,
} from './workflow-view.mts';
export { workflowReview } from './workflow-review.mts';
interface Options {
  unifiedSafety?: boolean;
  request: WorkflowRequest;
  epoch(): number;
  active(): boolean;
  actor(): string;
  review(ref: WorkRef): Promise<void>;
  enhance(root: HTMLElement): void;
  changed?(): void;
}
export function createWorkflowWorkspace(options: Options) {
  const invalidation = workflowInvalidator(
    () => {
      reconcile();
      options.changed?.();
    },
    () => options.active() && !document.hidden,
  );
  const root = node('section', '', 'portalPanel staffWorkflow');
  root.setAttribute('aria-label', 'Unified review workspace');
  root.hidden = true;
  const overview = node('section', '', 'portalPanel staffOverview');
  overview.setAttribute('aria-label', 'Review areas');
  overview.hidden = true;
  const overviewTitle = node('h3', 'Review areas');
  const shortcuts = node('div', '', 'staffOverviewLinks');
  overview.append(overviewTitle, shortcuts);
  const heading = node('div', '', 'panelHeader');
  const title = node('h3', 'My work');
  const headingActions = node('div', '', 'queueTools');
  headingActions.append(
    button('Refresh review queue', () => {
      void load();
    }),
  );
  const scope = node(
    'p',
    '',
  );
  const filters = node('div', '', 'queueFilters');
  filters.setAttribute('aria-label', 'Review ownership filter');
  let filter = 'mine',
    cursor: { at: string; key: string } | null = null;
  let next: { at: string; key: string } | null = null,
    generation = 0,
    busy = false,
    again = false;
  let area = 'inbox';
  let closed = false;
  const history = button('Show closed', () => {
    closed = !closed;
    history.textContent = closed ? 'Show open' : 'Show closed';
    cursor = null;
    previous.length = 0;
    void load();
  });
  history.hidden = true;
  headingActions.append(history);
  heading.append(title, headingActions);
  const previous: ({ at: string; key: string } | null)[] = [];
  const filterButtons = ['all', 'mine', 'unassigned'].map((value) => {
    const el = button(
      value === 'all' ? 'Team work' : value === 'mine' ? 'Assigned to me' : 'Unassigned',
      () => {
        filter = value;
        cursor = null;
        previous.length = 0;
        void load();
      },
    );
    el.classList.add('filterButton');
    filters.append(el);
    return { value, el };
  });
  const {
    root: sourceField,
    source,
    state,
  } = workflowFilters(() => {
    cursor = null;
    previous.length = 0;
    void load();
  });
  root.append(heading, scope, filters, sourceField);
  const feedback = status(root),
    wrap = node('div', '', 'tableWrap'),
    table = node('table', '', 'queueTable');
  const summary = node('p', '', 'workflowPageSummary');
  summary.hidden = true;
  root.append(summary);
  const head = node('thead'),
    header = node('tr');
  ['Request', 'Queue', 'Received', 'Ownership', 'State / deadline', 'Actions'].forEach((text) => {
    const th = node('th', text);
    th.scope = 'col';
    header.append(th);
  });
  head.append(header);
  const rows = node('tbody');
  table.append(head, rows);
  wrap.append(table);
  root.append(wrap);
  const paging = node('div', '', 'tableFooter');
  const first = button('Previous', () => {
    cursor = previous.pop() ?? null;
    void load();
  });
  const more = button('Next', () => {
    previous.push(cursor);
    cursor = next;
    void load();
  });
  const pageStatus = node('span');
  const pageButtons = node('div');
  pageButtons.append(first, more);
  paging.append(pageStatus, pageButtons);
  root.append(paging);
  const detail = createWorkflowCase({
    ...options,
    review: (ref) => review(ref),
    saved: () => {
      void load();
    },
  });
  function controls() {
    heading.querySelectorAll('button').forEach((b) => {
      b.disabled = busy;
    });
    filterButtons.forEach(({ value, el }) => {
      el.disabled = busy;
      el.setAttribute('aria-pressed', String(filter === value));
      el.classList.toggle('active', filter === value);
    });
    source.disabled = busy;
    state.disabled = busy;
    first.disabled = busy || !previous.length;
    more.disabled = busy || !next;
    window.DojiPortalSelect?.refresh(source);
    window.DojiPortalSelect?.refresh(state);
    options.enhance(sourceField);
    root.setAttribute('aria-busy', String(busy));
    wrap.setAttribute('aria-busy', String(busy));
    if (busy) pageStatus.textContent = 'Loading';
  }
  async function load() {
    if (!options.active() || root.hidden || document.hidden) return;
    if (busy) {
      again = true;
      return;
    }
    const g = generation,
      epoch = options.epoch();
    busy = true;
    controls();
    rows.querySelectorAll('button').forEach((b) => {
      b.disabled = true;
    });
    feedback.textContent = '';
    summary.hidden = true;
    rows.innerHTML = '<tr class="emptyTableRow"><td colspan="6"><div class="queueState" role="status">Loading review queue…</div></td></tr>';
    try {
      const safety = area !== 'inbox' ? { queue: area === 'safety' ? 'restricted_safety' : 'moderation', closed } : undefined;
      const page = workPage(
        await options.request(safety ? 'safety' : 'inbox', {
          p_kind: source.value,
          p_filter: filter,
          ...(safety ? { p_queue: safety.queue, p_closed: safety.closed } : { p_state: state.value }),
          p_limit: 25,
          p_after_at: cursor?.at ?? null,
          p_after_key: cursor?.key ?? null,
        }), safety,
      );
      if (g !== generation || epoch !== options.epoch() || !options.active()) return;
      next = page.next_cursor;
      pageStatus.textContent = `Page ${previous.length + 1} · ${page.items.length} shown · up to 25 per page`;
      summary.textContent = workflowPageSummary(page.items, Date.now());
      summary.hidden = true;
      pageStatus.title = workflowPageSummary(page.items, Date.now());
      rows.replaceChildren();
      for (const item of page.items) {
        rows.append(
          workflowRow(
            item,
            options.actor(),
            (ref) => {
              void detail.open(ref);
            },
            (ref) => {
              void review(ref);
            },
          ),
        );
      }
      if (!page.items.length) rows.innerHTML = '<tr class="emptyTableRow"><td colspan="6"><div class="queueState">No requests match this view.</div></td></tr>';
      [...source.options].forEach((option) => {
        option.disabled =
          option.value !== 'all' && !page.authorized_queues.some((k) => k === option.value);
      });
      feedback.textContent = !page.authorized_queues.length
        ? 'Your current permissions do not include any review queues.'
        : '';
    } catch (error) {
      if (g === generation && epoch === options.epoch() && options.active()) {
        if (record(error) && (error.status === 401 || error.status === 403)) {
          rows.replaceChildren();
          detail.clear();
        }
        next = null;
        rows.replaceChildren();
        pageStatus.textContent = 'Queue unavailable';
        feedback.textContent = 'Review queue unavailable. Refresh before opening a case.';
      }
    } finally {
      if (g === generation && epoch === options.epoch() && options.active()) {
        busy = false;
        controls();
        if (again) {
          again = false;
          void load();
        }
      }
    }
  }
  async function review(ref: WorkRef) {
    const g = generation,
      epoch = options.epoch();
    try {
      await options.review(ref);
    } catch {
      if (g === generation && epoch === options.epoch() && options.active())
        feedback.textContent =
          'Review could not be opened. Refresh to verify current access and state.';
    }
  }
  function clear() {
    invalidation.clear();
    generation++;
    busy = again = false;
    cursor = next = null;
    previous.length = 0;
    filter = 'mine';
    area = 'inbox';
    closed = false;
    source.value = state.value = 'all';
    rows.replaceChildren();
    feedback.textContent = '';
    summary.textContent = '';
    summary.hidden = true;
    root.hidden = true;
    overview.hidden = true;
    shortcuts.replaceChildren();
    detail.clear();
    legacyWorkflowVisibility(false);
    document.body.classList.remove('unifiedSafetyEnabled');
  }
  function reconcile() {
    if (!options.active()) {
      clear();
      return;
    }
    legacyWorkflowVisibility(true);
    document.body.classList.toggle('unifiedSafetyEnabled', options.unifiedSafety === true);
    const dashboard = document.querySelector<HTMLElement>('[data-portal-view="overview"]');
    overview.hidden = !dashboard || dashboard.hidden;
    if (!overview.hidden && dashboard) {
      if (overview.parentElement !== dashboard) {
        const hero = dashboard.querySelector('.viewIntro');
        if (hero) hero.after(overview);
        else dashboard.prepend(overview);
      }
      shortcuts.replaceChildren();
      for (const [view, title] of [['inbox', 'My work'], ['moderation', 'Trust & safety'], ['safety', 'Restricted safety'], ['businesses', 'Business applications'], ['suggestions', 'Community ideas']]) {
        const nav = document.querySelector<HTMLButtonElement>(`.portalNav [data-view="${view}"]`);
        if (nav && !nav.hidden) shortcuts.append(button(title!, () => nav.click()));
      }
    }
    // The dashboard is an overview, never a second full work queue.
    const view = (options.unifiedSafety ? ['inbox', 'moderation', 'safety'] : ['inbox'])
      .map((name) => document.querySelector<HTMLElement>(`[data-portal-view="${name}"]`))
      .find((el) => el && !el.hidden);
    if (view) {
      const nextArea = view.dataset.portalView!;
      if (area !== nextArea) {
        generation++;
        busy = again = false;
        area = nextArea;
        cursor = next = null;
        previous.length = 0;
        filter = area === 'inbox' ? 'mine' : 'all';
        source.value = state.value = 'all';
        closed = false;
        detail.clear();
      }
      title.textContent = area === 'inbox' ? 'My work' : area === 'safety' ? 'Restricted safety cases' : 'Trust & safety cases';
      root.setAttribute('aria-label', title.textContent);
      history.hidden = area === 'inbox';
      history.textContent = closed ? 'Show open' : 'Show closed';
      state.closest<HTMLElement>('.field')!.hidden = area !== 'inbox';
      source.options[0]!.textContent = area === 'inbox' ? 'All authorized queues' : 'All request types';
      for (const option of source.options) option.hidden = area !== 'inbox' && !['all', 'report', 'appeal', 'external_intake'].includes(option.value);
      if (root.parentElement !== view) {
        const intro = view.querySelector(':scope > .viewIntro');
        if (intro) intro.after(root);
        else view.prepend(root);
      }
      root.hidden = false;
      legacyWorkflowVisibility(true);
      void load();
    } else if (!root.hidden) {
      root.hidden = true;
      generation++;
      busy = again = false;
      rows.replaceChildren();
    }
    if (detail.isOpen() && !document.hidden) void detail.reconcile();
  }
  return {
    invalidate: invalidation.hint,
    reconcile,
    clear,
    destroy() {
      clear();
      root.remove();
      overview.remove();
      detail.destroy();
    },
  };
}
