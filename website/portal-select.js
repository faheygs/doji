/* Shared Doji dropdown. Extracted from portal.js; native values own form state. */
(() => {
  const queryAll = (selector, root = document) => [...root.querySelectorAll(selector)];
  const controls = new WeakMap();
  function closePortalSelects(except = null) {
    queryAll('.portalSelect.open').forEach((wrapper) => {
      if (wrapper === except) return;
      wrapper.classList.remove('open');
      wrapper.querySelector('.portalSelectTrigger')?.setAttribute('aria-expanded', 'false');
      wrapper.querySelector('.portalSelectTrigger')?.removeAttribute('aria-activedescendant');
    });
  }

  function enhancePortalSelect(select, accessible = false) {
    if (select.dataset.enhanced === 'true') return;
    select.dataset.enhanced = 'true';
    select.classList.add('portalSelectNative');
    const wrapper = document.createElement('div');
    wrapper.className = 'portalSelect';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'portalSelectTrigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>';
    const menu = document.createElement('div');
    menu.className = 'portalSelectMenu';
    menu.setAttribute('role', 'listbox');
    const controlId = `portal-select-${crypto.randomUUID()}`;
    let highlighted = select.selectedIndex;
    if (accessible) {
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');
      trigger.id = controlId;
      trigger.setAttribute('role', 'combobox');
      trigger.setAttribute('aria-controls', `${controlId}-options`);
      trigger.setAttribute('aria-required', String(select.required));
      if (select.getAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
      menu.id = `${controlId}-options`;
      const label = select.labels?.[0];
      if (label) {
        label.id ||= `${controlId}-label`;
        trigger.setAttribute('aria-labelledby', label.id);
        menu.setAttribute('aria-labelledby', label.id);
        label.addEventListener('click', (event) => { event.preventDefault(); trigger.focus(); });
      }
    }
    const renderOptions = () => {
      menu.innerHTML = '';
      [...select.options].forEach((option, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'portalSelectOption';
        item.setAttribute('role', 'option');
        if (accessible) { item.tabIndex = -1; item.id = `${controlId}-${index}`; }
        item.disabled = option.disabled;
        item.dataset.value = option.value;
        item.textContent = option.textContent;
        item.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          wrapper.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.removeAttribute('aria-activedescendant');
          if (accessible) trigger.focus();
        });
        menu.appendChild(item);
      });
    };
    renderOptions();
    wrapper.append(trigger, menu);
    const sync = () => {
      trigger.disabled = select.matches(':disabled');
      trigger.setAttribute('aria-required', String(select.required));
      if (trigger.disabled) closePortalSelects();
      trigger.querySelector('span').textContent = select.selectedOptions[0]?.textContent || 'Choose an option';
      queryAll('.portalSelectOption', menu).forEach((item) => {
        const selected = item.dataset.value === select.value;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', String(selected));
      });
    };
    const highlight = (index) => {
      const items = [...menu.children];
      highlighted = index;
      items.forEach((item, i) => item.classList.toggle('highlighted', i === index));
      if (items[index]) {
        trigger.setAttribute('aria-activedescendant', items[index].id);
        items[index].scrollIntoView({ block: 'nearest' });
      }
    };
    if (accessible) {
      trigger.addEventListener('keydown', (event) => {
        const open = wrapper.classList.contains('open');
        if (event.key === 'Escape' && open) {
          event.preventDefault(); event.stopPropagation();
          closePortalSelects(); trigger.removeAttribute('aria-activedescendant');
          return;
        }
        if (event.key === 'Tab') { closePortalSelects(); return; }
        const navigation = ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key);
        const typed = event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;
        if (!navigation && !typed && !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        if (open && ['Enter', ' '].includes(event.key)) {
          menu.children[highlighted]?.click(); return;
        }
        if (!open) trigger.click();
        const indexes = [...select.options].map((o, i) => o.disabled ? -1 : i).filter((i) => i >= 0);
        let index = indexes.indexOf(highlighted);
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = indexes.length - 1;
        else if (open && event.key === 'ArrowDown') index = Math.min(index + 1, indexes.length - 1);
        else if (open && event.key === 'ArrowUp') index = Math.max(index - 1, 0);
        else if (typed) {
          const match = indexes.find((i) => select.options[i].textContent.toLowerCase().startsWith(event.key.toLowerCase()));
          if (match !== undefined) index = indexes.indexOf(match);
        }
        highlight(indexes[Math.max(0, index)]);
      });
      wrapper.addEventListener('focusout', (event) => {
        // relatedTarget is the destination even while document.activeElement is
        // temporarily body during blur. Keep pointer-targeted options mounted.
        if (!wrapper.contains(event.relatedTarget)) closePortalSelects();
      });
    }
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      renderOptions();
      sync();
      const opening = !wrapper.classList.contains('open');
      closePortalSelects(wrapper);
      wrapper.classList.toggle('open', opening);
      trigger.setAttribute('aria-expanded', String(opening));
      if (accessible && opening) highlight(select.selectedIndex);
    });
    select.addEventListener('change', sync);
    if (accessible) {
      select.addEventListener('invalid', event => {
        event.preventDefault();
        trigger.setAttribute('aria-invalid', 'true');
        trigger.focus();
      });
      select.addEventListener('change', () => trigger.removeAttribute('aria-invalid'));
    }
    controls.set(select, () => { renderOptions(); sync(); });
    sync();
  }

  document.addEventListener('click', () => closePortalSelects());
  window.DojiPortalSelect = { enhance: enhancePortalSelect, close: closePortalSelects,
    refresh: select => controls.get(select)?.() };
})();
