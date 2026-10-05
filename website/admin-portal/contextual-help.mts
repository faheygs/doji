/* Portal-only progressive disclosure. Help never participates in field layout. */
declare global {
  interface Window {
    DojiContextualHelp?: { enhance(root?: ParentNode): void; close(): void };
  }
}
(() => {
  if (document.body.dataset.portal !== 'admin') return;
  let sequence = 0;
  let active: { panel: HTMLElement; button: HTMLButtonElement } | null = null;

  function close() {
    if (active?.panel.matches(':popover-open')) active.panel.hidePopover();
    active = null;
  }

  function position(panel: HTMLElement, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`;
    const height = panel.getBoundingClientRect().height;
    panel.style.top = `${Math.max(16, rect.bottom + height + 8 <= window.innerHeight - 16 ? rect.bottom + 8 : rect.top - height - 8)}px`;
  }

  function enhance(root: ParentNode = document) {
    // Older browsers retain readable inline guidance instead of a dead help control.
    if (typeof HTMLElement.prototype.showPopover !== 'function') return;
    root.querySelectorAll('[data-context-help]').forEach((content) => {
      const owner = content.closest('.field, [data-help-container]');
      const label = owner?.querySelector('label, [data-help-label]');
      if (!owner || !label) return;
      let button = owner.querySelector<HTMLButtonElement>('.contextualHelpTrigger');
      if (!button) {
        const row = document.createElement('div');
        row.className = 'contextualHelpLabel';
        label.before(row);
        row.append(label);
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'contextualHelpTrigger';
        button.textContent = '?';
        row.append(button);
        const requirement = owner.querySelector('.fieldRequirement');
        if (requirement) row.append(requirement);
        const panel = document.createElement('div');
        panel.className = 'contextualHelp';
        panel.id = `portal-help-${++sequence}`;
        panel.setAttribute('popover', 'auto');
        panel.setAttribute('role', 'note');
        owner.append(panel);
        panel.append(content);
        button.setAttribute('popovertarget', panel.id);
        button.setAttribute('aria-controls', panel.id);
        button.setAttribute('aria-expanded', 'false');
        const trigger = button;
        panel.addEventListener('toggle', (event) => {
          const open = event.newState === 'open';
          trigger.setAttribute('aria-expanded', String(open));
          if (open) {
            active = { panel, button: trigger };
            position(panel, trigger);
          } else if (active?.panel === panel) active = null;
        });
      }
      button.setAttribute('aria-label', `Help: ${label.textContent.trim()}`);
    });
  }

  // Escape dismisses guidance first, not the case beneath it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !active) return;
      const button = active.button;
      close();
      button.focus();
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener('portal:view', close);
  window.addEventListener('resize', close);
  document.addEventListener(
    'scroll',
    (event) => {
      // Keyboard focus can scroll the drawer just after opening a popover. Keep
      // the help anchored instead of immediately dismissing the user's action.
      if (active && !(event.target instanceof Node && active.panel.contains(event.target))) {
        if (!active.button.isConnected) close();
        else position(active.panel, active.button);
      }
    },
    true,
  );
  Object.assign(window, { DojiContextualHelp: Object.freeze({ enhance, close }) });
  enhance();
})();
