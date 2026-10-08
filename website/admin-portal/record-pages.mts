// Admin presentation/navigation only. Existing controllers own reads, writes and cleanup.
interface RecordPageOptions { close(): void; busy(): boolean }
interface RecordPages {
  show(element: HTMLElement, options: RecordPageOptions): void;
  sync(element: HTMLElement): void;
  modal(element: HTMLDialogElement): void;
  hide(element: HTMLElement): void;
}
declare global { interface Window { DojiRecordPages?: RecordPages } }
(() => {
  let active: { element: HTMLElement; options: RecordPageOptions; token: string; scroll: number; focus: Element | null } | null = null;
  let returning = false;
  let fromHistory = false;
  const main = () => document.querySelector<HTMLElement>('.adminPortalPage .portalMain');
  const marker = () => history.state?.dojiRecordPage;
  const push = () => { if (active) history.pushState({ dojiRecordPage: active.token }, ''); };
  function sync(element: HTMLElement) {
    if (active?.element !== element) return;
    element.classList.add('adminRecordPage');
    element.setAttribute('role', element instanceof HTMLDialogElement ? 'dialog' : 'region');
    element.removeAttribute('aria-modal');
    const back = element.querySelector<HTMLElement>('.drawerHeader .drawerCloseButton,.modalHeader .drawerCloseButton');
    if (back) { back.textContent = 'Back to queue'; back.setAttribute('aria-label', 'Back to queue'); }
    const actions = element.querySelector<HTMLElement>('#drawerActions, #businessReviewForm > .editorialActions, #privacyForm > .editorialActions, #editorialDraft > .editorialActions, .editorialDialog:not(.businessReviewDialog) > .editorialDrawerContent > .editorialActions');
    const oldFooter = element.querySelector(':scope > .recordPageFooter');
    if (actions && !oldFooter?.contains(actions)) {
      oldFooter?.remove();
      const form = actions.closest('form');
      if (form?.id) actions.querySelectorAll('button').forEach(button => {
        if (button.type === 'submit') button.setAttribute('form', form.id);
      });
      const footer = document.createElement('footer');
      footer.className = 'recordPageFooter';
      if (form?.id) footer.dataset.form = form.id;
      footer.append(actions);
      element.append(footer);
    } else if (!actions && oldFooter instanceof HTMLElement && oldFooter.dataset.form &&
      !element.querySelector(`#${CSS.escape(oldFooter.dataset.form)}`)) oldFooter.remove();
  }
  function hide(element: HTMLElement) {
    if (active?.element !== element) return;
    const previous = active;
    active = null;
    element.classList.remove('adminRecordPage');
    main()?.classList.remove('recordPageActive');
    if (!fromHistory && marker() === previous.token) { returning = true; history.back(); }
    window.scrollTo(0, previous.scroll);
    if (previous.focus instanceof HTMLElement && previous.focus.isConnected)
      previous.focus.focus({ preventScroll: true });
  }
  function show(element: HTMLElement, options: RecordPageOptions) {
    const host = main();
    if (!host) return;
    if (active?.element !== element) {
      if (active) { if (active.options.busy()) return; active.options.close(); }
      active = { element, options, token: crypto.randomUUID(),
        scroll: window.scrollY, focus: document.activeElement };
      if (!returning) push();
      host.append(element);
      host.classList.add('recordPageActive');
      window.scrollTo(0, 0);
    }
    if (element.id === 'caseDrawer' && !element.querySelector('.adminRecordBody')) {
      const body = document.createElement('div');
      body.className = 'adminRecordBody';
      for (const child of Array.from(element.children)) {
        if (!child.classList.contains('drawerHeader')) body.append(child);
      }
      element.append(body);
    }
    sync(element);
    if (element instanceof HTMLDialogElement) {
      if (element.matches(':modal')) element.close();
      if (!element.open) element.show();
    }
  }
  function modal(element: HTMLDialogElement) {
    element.classList.remove('adminRecordPage');
    element.setAttribute('role', 'dialog');
    if (element.open) element.close();
    element.showModal();
  }
  window.addEventListener('popstate', () => {
    if (returning) { returning = false; if (active) push(); return; }
    if (!active || marker() === active.token) return;
    if (active.options.busy()) { push(); return; }
    fromHistory = true;
    active.options.close();
    fromHistory = false;
  });
  // Section changes use the same controller cleanup. Never leave a pending command.
  document.addEventListener('click', (event) => {
    if (!active || !(event.target instanceof Element) || !event.target.closest('.portalNav [data-view],[data-view-jump]')) return;
    if (active.options.busy()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    active.options.close();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !active || document.querySelector('dialog:modal,:popover-open,.portalSelect.open')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!active.options.busy()) active.options.close();
  });
  window.DojiRecordPages = { show, sync, modal, hide };
})();

export {};
