// Gated, lazily loaded admin integration. Production flag remains off.
import { applicationForm, businessStateLabel } from '../business-portal/application-form.js';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const actions = {
  approve: 'Approve',
  decline: 'Decline',
  request_changes: 'Request changes',
  reopen: 'Reopen',
};
export function createBusinessReview({
  enabled,
  root,
  client,
  session,
  epoch,
  onSaved = () => {},
}) {
  if (enabled !== true) throw Error('Business review is not enabled.');
  let generation = 0,
    record = null,
    pending = false,
    stale = false,
    intent = null,
    returnFocus = null,
    cursor = null,
    next = null,
    filter = 'pending',
    loading = false,
    reconciling = false,
    queueGeneration = 0,
    loadAgain = false,
    reconcileAgain = false;
  const canRead = () => session()?.capabilities?.business_read === true;
  const canWrite = () => canRead() && session()?.capabilities?.operator_manage === true;
  const valid = (stamp, auth) => stamp === generation && auth === epoch() && canRead();
  const dialog = document.createElement('dialog');
  dialog.className = 'portalModal editorialDialog portalDrawer adminDrawer businessReviewDialog open';
  dialog.setAttribute('aria-labelledby', 'businessReviewTitle');
  document.body.append(dialog);
  function close(force = false) {
    if (pending && !force) return;
    generation++;
    record = null;
    intent = null;
    stale = false;
    reconciling = reconcileAgain = false;
    dialog.close();
    dialog.replaceChildren();
    if (!force && returnFocus?.isConnected) returnFocus.focus();
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  let backdrop = false;
  const outside = (event) => {
    const bounds = dialog.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  };
  dialog.addEventListener('pointerdown', (event) => {
    backdrop = outside(event);
  });
  dialog.addEventListener('pointerup', (event) => {
    if (backdrop && outside(event)) close();
    backdrop = false;
  });
  const feedback = (value) => {
    const node = dialog.querySelector('[role="status"]');
    if (node) node.textContent = value;
  };
  function show(item) {
    record = item;
    stale = false;
    dialog.innerHTML = `<header class="drawerHeader"><h2 id="businessReviewTitle" tabindex="-1">${escape(item.details?.brand_name || 'Business application')}</h2><button class="drawerCloseButton" type="button" data-close>Close</button></header><div class="editorialDrawerContent"><p class="eyebrow">${escape(businessStateLabel(item.state))} · Submission ${escape(item.latest_submission?.submission)}</p><p>Application ${escape(item.id)} · Revision ${escape(item.revision)}</p><section aria-label="Submitted business application">${applicationForm(item.details, true, 'businessReview')}</section><p>Application terms: ${escape(item.latest_submission?.terms_version)} · Privacy: ${escape(item.latest_submission?.privacy_version)}</p><p>Approval grants business workspace access only. Campaign publishing and billing remain disabled. Reopening suspends that workspace.</p><form id="businessReviewForm"${!canWrite() ? ' hidden' : ''}><div class="field"><label for="businessReviewDecision">Decision</label><select id="businessReviewDecision" required><option value="">Choose a decision</option>${(item.state === 'pending' ? ['approve', 'decline', 'request_changes'] : ['approved', 'declined'].includes(item.state) ? ['reopen'] : []).map((action) => `<option value="${action}">${actions[action]}</option>`).join('')}</select></div><div class="field"><label for="businessReviewResponse">Response to applicant</label><textarea id="businessReviewResponse" required minlength="8" maxlength="1000" rows="3"></textarea><small>The applicant can see this response. Do not include private reviewer information.</small></div><div class="field"><label for="businessReviewNote">Internal review rationale</label><textarea id="businessReviewNote" required minlength="8" maxlength="2000" rows="3"></textarea><small>Restricted staff only. Explain the evidence supporting this decision.</small></div><div class="editorialActions"><button type="submit" class="portalButton primary">Review decision</button></div><section id="businessReviewConfirm" hidden><h3>Confirm decision</h3><p id="businessReviewSummary"></p><div class="editorialActions"><button type="button" class="portalButton" id="businessReviewBack">Back</button><button type="button" class="portalButton primary" id="businessReviewApply">Confirm</button></div></section></form><p role="status" aria-live="polite"></p><h3>Recent case history</h3>${(item.history || []).map((entry) => `<article class="editorialPreview"><strong>${escape(actions[entry.action] || entry.action)}</strong><p>${escape(entry.response)}</p><p>${escape(entry.internal_note)}</p></article>`).join('')}${item.history_has_more ? '<p>Showing the most recent 30 entries. Older history is retained; extended history navigation is not available in this candidate.</p>' : ''}</div>`;
    dialog.querySelector('[data-close]').onclick = () => close();
    const decision = dialog.querySelector('select');
    window.DojiPortalSelect.enhance(decision, true);
    const form = dialog.querySelector('form');
    form.addEventListener('input', () => {
      intent = null;
      dialog.querySelector('#businessReviewConfirm').hidden = true;
    });
    form.addEventListener('change', () => {
      intent = null;
      dialog.querySelector('#businessReviewConfirm').hidden = true;
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!canWrite() || pending || stale) return;
      const body = {
        p_id: record.id,
        p_revision: record.revision,
        p_action: decision.value,
        p_response: dialog.querySelector('#businessReviewResponse').value.trim(),
        p_internal_note: dialog.querySelector('#businessReviewNote').value.trim(),
      };
      const fingerprint = JSON.stringify(body);
      if (!intent || intent.fingerprint !== fingerprint)
        intent = { body, fingerprint, id: crypto.randomUUID() };
      dialog.querySelector('#businessReviewSummary').textContent =
        `${actions[body.p_action]} application ${record.id}, submission ${record.latest_submission.submission}, revision ${record.revision}. Applicant response: ${body.p_response}`;
      dialog.querySelector('#businessReviewConfirm').hidden = false;
      dialog.querySelector('#businessReviewApply').focus();
    };
    dialog.querySelector('#businessReviewBack').onclick = () => {
      dialog.querySelector('#businessReviewConfirm').hidden = true;
      decision.closest('.portalSelect').querySelector('button').focus();
    };
    dialog.querySelector('#businessReviewApply').onclick = async () => {
      if (!intent || pending || stale || !canWrite()) return;
      const stamp = generation,
        auth = epoch(),
        submitted = intent;
      pending = true;
      form.querySelectorAll('button,input,select,textarea').forEach((node) => {
        node.disabled = true;
      });
      window.DojiPortalSelect.refresh(decision);
      feedback('Applying decision…');
      try {
        const result = await client.command({ ...submitted.body, p_request_id: submitted.id });
        if (!valid(stamp, auth)) return;
        if (result?.application?.id !== submitted.body.p_id) throw Error('The returned application identity could not be verified. Refresh before deciding.');
        show(result.application);
        onSaved();
      } catch (error) {
        if (!valid(stamp, auth)) return;
        stale = error.status === 409 || ['PT409', '40001'].includes(error.code);
        feedback(error.message + (stale ? ' Close and reopen the record before deciding.' : ''));
      } finally {
        if (valid(stamp, auth)) {
          pending = false;
          form.querySelectorAll('button,input,select,textarea').forEach((node) => {
            node.disabled = false;
          });
          window.DojiPortalSelect.refresh(decision);
          dialog.querySelector('#businessReviewApply').disabled = stale;
        }
      }
    };
  }
  async function open(id, trigger = document.activeElement) {
    if (!canRead() || pending) return;
    close(true);
    returnFocus = trigger;
    const stamp = generation,
      auth = epoch();
    dialog.innerHTML =
      '<header class="drawerHeader"><h2 id="businessReviewTitle">Loading application…</h2><button type="button" class="drawerCloseButton">Close</button></header><p role="status"></p>';
    dialog.querySelector('button').onclick = () => close();
    dialog.showModal();
    try {
      const item = await client.detail(id);
      if (!valid(stamp, auth)) return;
      if (item?.id !== id) throw Error('The returned application identity could not be verified.');
      show(item);
      dialog.querySelector('h2').focus();
    } catch (error) {
      if (valid(stamp, auth)) feedback(error.message);
    }
  }
  async function load() {
    if (!canRead()) return;
    if (loading) { loadAgain = true; return; }
    loading = true;
    const stamp = ++queueGeneration,
      auth = epoch();
    const current = () => stamp === queueGeneration && auth === epoch() && canRead();
    try {
      const page = await client.page({
        p_state: filter,
        p_limit: 25,
        p_after_at: cursor?.at ?? null,
        p_after_id: cursor?.id ?? null,
      });
      if (!current()) return;
      if (!Array.isArray(page?.items) || page.items.length > 25) throw Error('The application queue could not be verified.');
      next = page.next_cursor;
      root.innerHTML = `<div class="editorialFilter"><label for="businessQueueState">Application status</label><select id="businessQueueState">${['pending', 'changes_requested', 'approved', 'declined'].map((value) => `<option value="${value}"${filter === value ? ' selected' : ''}>${businessStateLabel(value)}</option>`).join('')}</select><button class="portalButton" type="button" data-refresh>Refresh applications</button></div><div class="businessAdminGrid">${page.items.map((item) => `<button type="button" class="businessAdminCard" data-application-id="${escape(item.id)}"><span class="businessAvatar" aria-hidden="true">${escape((item.brand_name || '').charAt(0))}</span><span class="businessCardBody"><span class="businessCardHeading"><strong>${escape(item.brand_name || 'Business application')}</strong><span class="statusPill">${escape(businessStateLabel(item.state))}</span></span></span><span class="rowChevron" aria-hidden="true">›</span></button>`).join('') || '<p>No applications in this view.</p>'}</div><div class="editorialActions"><button type="button" class="portalButton" data-first${!cursor ? ' disabled' : ''}>First page</button><button type="button" class="portalButton" data-next${!next ? ' disabled' : ''}>Next page</button></div><p role="status"></p>`;
      const select = root.querySelector('select');
      window.DojiPortalSelect.enhance(select, true);
      select.onchange = () => {
        filter = select.value;
        cursor = null;
        void load();
      };
      root.querySelectorAll('[data-application-id]').forEach((button) => {
        button.onclick = () => {
          void open(button.dataset.applicationId, button);
        };
      });
      root.querySelector('[data-first]').onclick = () => {
        cursor = null;
        void load();
      };
      root.querySelector('[data-refresh]').onclick = () => { void load(); };
      root.querySelector('[data-next]').onclick = () => {
        cursor = next;
        void load();
      };
    } catch (error) {
      if (current()) {
        root.replaceChildren();
        const node = document.createElement('p');
        node.setAttribute('role', 'status');
        node.textContent = error.message;
        root.append(node);
        const retry = document.createElement('button');
        retry.type = 'button'; retry.className = 'portalButton'; retry.textContent = 'Retry applications';
        retry.onclick = () => { void load(); }; root.append(retry);
      }
    } finally {
      if (stamp === queueGeneration) {
        loading = false;
        if (loadAgain && current()) { loadAgain = false; void load(); }
      }
    }
  }
  return {
    open,
    load,
    isOpen: () => dialog.open,
    async reconcile() {
      if (pending) return;
      if (reconciling) { reconcileAgain = true; return; }
      if (!dialog.open || !record) return load();
      const stamp = generation,
        auth = epoch(),
        id = record.id;
      reconciling = true;
      try {
        const latest = await client.detail(id);
        if (!valid(stamp, auth) || record?.id !== id) return;
        if (latest?.id !== id) throw Error('The returned application identity could not be verified.');
        if (latest.revision !== record.revision) {
          stale = true;
          feedback(
            'This case changed. Your notes are preserved. Close and reopen before deciding.',
          );
        }
      } catch (error) {
        if (valid(stamp, auth)) {
          stale = true;
          feedback(
            'The current case could not be verified. Your notes are preserved. Close and reopen before deciding.',
          );
        }
      } finally {
        if (valid(stamp, auth)) {
          reconciling = false;
          if (reconcileAgain) { reconcileAgain = false; void this.reconcile(); }
        }
      }
    },
    clear() {
      close(true);
      queueGeneration++;
      pending = loading = reconciling = loadAgain = reconcileAgain = false;
      cursor = next = null;
      root.replaceChildren();
    },
    destroy() {
      close(true);
      queueGeneration++;
      dialog.remove();
      root.replaceChildren();
    },
  };
}
