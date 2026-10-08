import {
  ownership,
  assignees,
  record,
  invalid,
  node,
  button,
  status,
  label,
  type Ownership,
  type WorkRef,
  type WorkflowRequest,
} from './workflow-contracts.mts';
interface Options {
  request: WorkflowRequest;
  epoch(): number;
  active(): boolean;
  actor(): string;
  saved(): void;
  review(ref: WorkRef): Promise<void>;
  enhance(root: HTMLElement): void;
}
export function createWorkflowCase(options: Options) {
  const dialog = node('dialog', '', 'staffWorkflowDialog portalModal');
  dialog.setAttribute('aria-label', 'Case ownership');
  document.body.append(dialog);
  let ref: WorkRef | null = null,
    current: Ownership | null = null,
    generation = 0,
    pending = false,
    reading = false;
  let intent: Record<string, unknown> | null = null,
    intentLabel = '',
    feedback = '',
    stale = false,
    selectedTarget = '';
  let directory: { id: string; label: string }[] = [],
    next: string | null = null,
    directoryBusy = false;
  const valid = (g: number, epoch: number) =>
    g === generation && epoch === options.epoch() && options.active() && dialog.open;
  const controls = () =>
    dialog
      .querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select')
      .forEach((el) => {
        el.disabled = true;
      });
  let returnFocus: HTMLElement | null = null;
  function clear() {
    generation++;
    ref = current = intent = null;
    pending = reading = directoryBusy = stale = false;
    directory = [];
    next = null;
    feedback = selectedTarget = '';
    dialog.close();
    dialog.replaceChildren();
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  dialog.addEventListener('cancel', (event) => {
    if (pending) event.preventDefault();
    else clear();
  });
  async function read(reconcile = false) {
    if (!ref || pending || reading || (reconcile && intent)) return;
    const g = generation,
      epoch = options.epoch(),
      exact = ref;
    reading = true;
    controls();
    try {
      const result = ownership(
        await options.request('ownership', { p_kind: exact.kind, p_id: exact.id }),
        exact,
      );
      if (!valid(g, epoch)) return;
      if (
        reconcile &&
        current &&
        (result.revision !== current.revision || result.source_version !== current.source_version)
      ) {
        stale = true;
        feedback = 'This case changed. Refresh ownership before taking another action.';
      } else {
        current = result;
        stale = false;
        if (!reconcile) {
          intent = null;
          directory = [];
          next = null;
          selectedTarget = '';
        }
      }
    } catch (error) {
      if (valid(g, epoch)) {
        if (record(error) && (error.status === 401 || error.status === 403)) {
          current = null;
          directory = [];
        }
        stale = true;
        feedback =
          'Ownership could not be verified. No new action is available until refresh succeeds.';
      }
    } finally {
      if (valid(g, epoch)) {
        reading = false;
        render();
      }
    }
  }
  function prepare(action: string, target: string | null = null, targetLabel = '') {
    if (!current || !ref || stale || pending || reading || intent || !options.active()) return;
    intent = {
      p_kind: ref.kind,
      p_id: ref.id,
      p_revision: current.revision,
      p_source_version: current.source_version,
      p_action: action,
      p_target: target,
      p_request_id: crypto.randomUUID(),
    };
    intentLabel =
      action === 'claim'
        ? 'Assign this case to me'
        : action === 'release'
          ? 'Release this case to the unassigned queue'
          : `Assign this case to ${targetLabel}`;
    feedback = '';
    render();
  }
  async function command() {
    if (!intent || !ref || pending || !options.active()) return;
    const input = intent,
      g = generation,
      epoch = options.epoch();
    pending = true;
    controls();
    try {
      const result = await options.request('command', input);
      if (!valid(g, epoch)) return;
      if (
        !record(result) ||
        result.kind !== ref.kind ||
        result.id !== ref.id ||
        result.revision !== Number(input.p_revision) + 1 ||
        typeof result.replayed !== 'boolean' ||
        result.assigned_to !== (input.p_action === 'claim' ? options.actor() : input.p_target)
      )
        throw invalid();
      intent = null;
      feedback = 'Ownership change recorded.';
      pending = false;
      options.saved();
      await read();
    } catch (error) {
      if (!valid(g, epoch)) return;
      const code = record(error) ? error.status : null;
      if (code === 409 || code === 403 || code === 401 || code === 400) {
        if (code === 403 || code === 401) {
          current = null;
          directory = [];
        }
        intent = null;
        stale = true;
        feedback =
          'The action was not accepted. Refresh ownership to check current access and state.';
      } else
        feedback =
          'The result could not be confirmed. Retry the same action safely, or refresh to inspect current ownership.';
    } finally {
      if (valid(g, epoch)) {
        pending = false;
        render();
      }
    }
  }
  async function directoryPage() {
    if (!ref || !current?.can_assign || stale || directoryBusy || intent) return;
    const g = generation,
      epoch = options.epoch(),
      after = next;
    directoryBusy = true;
    controls();
    try {
      const page = assignees(
        await options.request('assignees', {
          p_kind: ref.kind,
          p_id: ref.id,
          p_after_id: after,
          p_limit: 25,
        }),
      );
      if (!valid(g, epoch)) return;
      if (page.next_cursor === after && after !== null) throw invalid();
      const merged = [...directory, ...page.items];
      if (new Set(merged.map((x) => x.id)).size !== merged.length) throw invalid();
      directory = merged;
      next = page.next_cursor;
      feedback = directory.length ? '' : 'No eligible employees are available.';
    } catch (error) {
      if (valid(g, epoch)) {
        if (record(error) && (error.status === 401 || error.status === 403)) {
          current = null;
          directory = [];
          next = null;
          selectedTarget = '';
          stale = true;
        }
        feedback =
          'The eligible employee list could not be loaded. Refresh ownership to verify access.';
      }
    } finally {
      if (valid(g, epoch)) {
        directoryBusy = false;
        render();
      }
    }
  }
  function render() {
    if (!ref || !dialog.open) return;
    dialog.replaceChildren();
    const heading = node('h2', `${label(ref.kind)} ownership`);
    heading.tabIndex = -1;
    const top = node('div', '', 'modalHeader');
    top.append(heading, button('Close', clear));
    dialog.append(top);
    const body = node('div', '', 'modalBody');
    dialog.append(body);
    body.append(
      node('p', 'Ownership coordinates work. Approval and moderation permissions do not change.'),
    );
    if (current) {
      body.append(
        node('p', `Owner: ${current.owner_label}`),
        node(
          'p',
          current.can_decide
            ? 'Your current permissions allow review decisions in the existing review screen.'
            : 'You can view this case, but your current permissions do not allow a review decision.',
        ),
      );
    }
    const notice = status(body);
    notice.textContent = feedback || (reading ? 'Loading ownership…' : '');
    const actions = node('div', '', 'introActions');
    body.append(actions);
    actions.append(
      button('Refresh ownership', () => {
        feedback = '';
        void read();
      }),
    );
    if (intent) {
      body.append(node('p', `${intentLabel}?`));
      actions.append(
        button(
          feedback.startsWith('The result')
            ? 'Retry same ownership change'
            : 'Confirm ownership change',
          () => {
            void command();
          },
          true,
        ),
        button('Cancel change', () => {
          intent = null;
          render();
        }),
      );
    } else if (current && !stale) {
      if (current.can_claim) actions.append(button('Assign to me', () => prepare('claim')));
      if (current.can_release)
        actions.append(button('Release ownership', () => prepare('release')));
      if (current.can_assign) {
        if (!directory.length)
          actions.append(
            button('Choose employee', () => {
              void directoryPage();
            }),
          );
        else {
          const field = node('div', '', 'field'),
            selectLabel = node('label', 'Assign to employee'),
            select = node('select');
          select.id = 'staff-workflow-assignee';
          selectLabel.htmlFor = select.id;
          select.append(new Option('Select an employee', ''));
          directory.forEach((e) => select.append(new Option(e.label, e.id)));
          select.value = selectedTarget;
          const assign = button('Review reassignment', () => {
            const target = directory.find((e) => e.id === select.value);
            if (target) prepare('assign', target.id, target.label);
          });
          assign.disabled = !select.value;
          select.onchange = () => {
            selectedTarget = select.value;
            assign.disabled = !select.value;
          };
          field.append(selectLabel, select);
          body.append(field);
          actions.append(assign);
          if (next)
            actions.append(
              button('More employees', () => {
                void directoryPage();
              }),
            );
          options.enhance(field);
        }
      }
      actions.append(
        button(
          'Open review',
          () => {
            const exact = ref!,
              epoch = options.epoch();
            clear();
            const g = generation;
            void options.review(exact).catch(() => {
              if (options.active() && epoch === options.epoch() && g === generation)
                void open(exact, 'Review could not be opened. Please try again.');
            });
          },
          true,
        ),
      );
    }
    if (pending || reading || directoryBusy) controls();
  }
  async function open(exact: WorkRef, message = '') {
    clear();
    feedback = message;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref = { kind: exact.kind, id: exact.id };
    dialog.showModal();
    render();
    await read();
    dialog.querySelector<HTMLElement>('h2')?.focus();
  }
  return {
    open,
    clear,
    reconcile: () => read(true),
    isOpen: () => dialog.open,
    destroy() {
      clear();
      dialog.remove();
    },
  };
}
