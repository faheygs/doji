// Gated, lazily loaded admin integration. Production flag remains off.
import type {} from './record-pages.mts';
import {
  applicationForm,
  businessStateLabel,
  type ApplicationDetails,
} from '../business-portal/application-form.mts';
interface ReviewApplication {
  id: string;
  revision: number;
  state: string;
  details?: ApplicationDetails;
  latest_submission: { submission: number; terms_version?: string; privacy_version?: string };
  history?: { action: string; response?: string; internal_note?: string }[];
  history_has_more?: boolean;
}
interface ReviewDecision {
  p_id: string;
  p_revision: number;
  p_action: string;
  p_response: string;
  p_internal_note: string;
}
interface Cursor {
  at: string;
  id: string;
}
export interface BusinessReviewClient {
  detail(id: string): Promise<ReviewApplication>;
  page(body: {
    p_state: string;
    p_limit: number;
    p_after_at: string | null;
    p_after_id: string | null;
  }): Promise<{
    items: { id: string; brand_name?: string; state: string }[];
    next_cursor: Cursor | null;
  }>;
  command(
    body: ReviewDecision & { p_request_id: string },
  ): Promise<{ application: ReviewApplication }>;
}
interface ReviewOptions {
  enabled: boolean;
  root: HTMLElement;
  client: BusinessReviewClient;
  session():
    | { capabilities?: { business_read?: boolean; operator_manage?: boolean } }
    | null
    | undefined;
  epoch(): number;
  onSaved?(): void;
}
function failure(error: unknown) {
  const value = error !== null && typeof error === 'object' ? error : {};
  return {
    message:
      'message' in value && typeof value.message === 'string'
        ? value.message
        : 'The request could not be completed.',
    status: 'status' in value ? value.status : undefined,
    code: 'code' in value ? value.code : undefined,
  };
}
const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => entities[c]!);
const actions: Readonly<Record<string, string>> = {
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
}: ReviewOptions) {
  if (enabled !== true) throw Error('Business review is not enabled.');
  root.classList.add('businessQueuePanel', 'portalPanel');
  const previous: (Cursor | null)[] = [];
  let generation = 0,
    record: ReviewApplication | null = null,
    pending = false,
    stale = false,
    intent: { body: ReviewDecision; fingerprint: string; id: string } | null = null,
    returnFocus: Element | null = null,
    cursor: Cursor | null = null,
    next: Cursor | null = null,
    filter = 'pending',
    loading = false,
    reconciling = false,
    queueGeneration = 0,
    loadAgain = false,
    reconcileAgain = false;
  const canRead = () => session()?.capabilities?.business_read === true;
  const canWrite = () => canRead() && session()?.capabilities?.operator_manage === true;
  const valid = (stamp: number, auth: number) =>
    stamp === generation && auth === epoch() && canRead();
  const dialog = document.createElement('dialog');
  dialog.className =
    'portalModal editorialDialog portalDrawer adminDrawer businessReviewDialog open';
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
    window.DojiRecordPages?.hide(dialog);
    dialog.replaceChildren();
    if (!force && returnFocus instanceof HTMLElement && returnFocus.isConnected)
      returnFocus.focus();
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  let backdrop = false;
  const outside = (event: PointerEvent) => {
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
  const feedback = (value: string) => {
    const node = dialog.querySelector('[role="status"]');
    if (node) node.textContent = value;
  };
  function show(item: ReviewApplication) {
    record = item;
    stale = false;
    dialog.innerHTML = `<header class="drawerHeader"><h2 id="businessReviewTitle" tabindex="-1">${escape(item.details?.brand_name || 'Business application')}</h2><button class="drawerCloseButton" type="button" data-close>Close</button></header><div class="editorialDrawerContent"><p class="eyebrow">${escape(businessStateLabel(item.state))} · Submission ${escape(item.latest_submission?.submission)}</p><p>Application ${escape(item.id)} · Revision ${escape(item.revision)}</p><section aria-label="Submitted business application">${applicationForm(item.details, true, 'businessReview')}</section><p>Application terms: ${escape(item.latest_submission?.terms_version)} · Privacy: ${escape(item.latest_submission?.privacy_version)}</p><p>Approval grants business workspace access only. Campaign publishing and billing remain disabled. Reopening suspends that workspace.</p><form id="businessReviewForm"${!canWrite() ? ' hidden' : ''}><div class="field"><label for="businessReviewDecision">Decision</label><select id="businessReviewDecision" required><option value="">Choose a decision</option>${(item.state === 'pending' ? ['approve', 'decline', 'request_changes'] : ['approved', 'declined'].includes(item.state) ? ['reopen'] : []).map((action) => `<option value="${action}">${actions[action]}</option>`).join('')}</select></div><div class="field"><label for="businessReviewResponse">Response to applicant</label><textarea id="businessReviewResponse" required minlength="8" maxlength="1000" rows="3"></textarea><small>The applicant can see this response. Do not include private reviewer information.</small></div><div class="field"><label for="businessReviewNote">Internal review rationale</label><textarea id="businessReviewNote" required minlength="8" maxlength="2000" rows="3"></textarea><small>Restricted staff only. Explain the evidence supporting this decision.</small></div><div class="editorialActions"><button type="submit" class="portalButton primary">Review decision</button></div><section id="businessReviewConfirm" hidden><h3>Confirm decision</h3><p id="businessReviewSummary"></p><div class="editorialActions"><button type="button" class="portalButton" id="businessReviewBack">Back</button><button type="button" class="portalButton primary" id="businessReviewApply">Confirm</button></div></section></form><p role="status" aria-live="polite"></p><h3>Recent case history</h3>${(item.history || []).map((entry) => `<article class="editorialPreview"><strong>${escape(actions[entry.action] || entry.action)}</strong><p>${escape(entry.response)}</p><p>${escape(entry.internal_note)}</p></article>`).join('')}${item.history_has_more ? '<p>Showing the most recent 30 entries. Older history is retained; extended history navigation is not available in this candidate.</p>' : ''}</div>`;
    dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => close();
    window.DojiRecordPages?.sync(dialog);
    const decision = dialog.querySelector('select')!;
    window.DojiPortalSelect.enhance(decision, true);
    const form = dialog.querySelector('form')!;
    form.addEventListener('input', () => {
      intent = null;
      dialog.querySelector<HTMLElement>('#businessReviewConfirm')!.hidden = true;
    });
    form.addEventListener('change', () => {
      intent = null;
      dialog.querySelector<HTMLElement>('#businessReviewConfirm')!.hidden = true;
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!canWrite() || pending || stale || !record) return;
      const body = {
        p_id: record.id,
        p_revision: record.revision,
        p_action: decision.value,
        p_response: dialog
          .querySelector<HTMLTextAreaElement>('#businessReviewResponse')!
          .value.trim(),
        p_internal_note: dialog
          .querySelector<HTMLTextAreaElement>('#businessReviewNote')!
          .value.trim(),
      };
      const fingerprint = JSON.stringify(body);
      if (!intent || intent.fingerprint !== fingerprint)
        intent = { body, fingerprint, id: crypto.randomUUID() };
      dialog.querySelector<HTMLElement>('#businessReviewSummary')!.textContent =
        `${actions[body.p_action]} application ${record.id}, submission ${record.latest_submission.submission}, revision ${record.revision}. Applicant response: ${body.p_response}`;
      dialog.querySelector<HTMLElement>('#businessReviewConfirm')!.hidden = false;
      dialog.querySelector<HTMLButtonElement>('#businessReviewApply')!.focus();
    };
    dialog.querySelector<HTMLButtonElement>('#businessReviewBack')!.onclick = () => {
      dialog.querySelector<HTMLElement>('#businessReviewConfirm')!.hidden = true;
      decision.closest('.portalSelect')!.querySelector('button')!.focus();
    };
    dialog.querySelector<HTMLButtonElement>('#businessReviewApply')!.onclick = async () => {
      if (!intent || pending || stale || !canWrite()) return;
      const stamp = generation,
        auth = epoch(),
        submitted = intent;
      pending = true;
      dialog
        .querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
        >('button,input,select,textarea')
        .forEach((node) => {
          node.disabled = true;
        });
      window.DojiPortalSelect.refresh(decision);
      feedback('Applying decision…');
      try {
        const result = await client.command({ ...submitted.body, p_request_id: submitted.id });
        if (!valid(stamp, auth)) return;
        if (result?.application?.id !== submitted.body.p_id)
          throw Error(
            'The returned application identity could not be verified. Refresh before deciding.',
          );
        show(result.application);
        onSaved();
      } catch (cause) {
        const error = failure(cause);
        if (!valid(stamp, auth)) return;
        stale = error.status === 409 || error.code === 'PT409' || error.code === '40001';
        feedback(error.message + (stale ? ' Close and reopen the record before deciding.' : ''));
      } finally {
        if (valid(stamp, auth)) {
          pending = false;
          dialog
            .querySelectorAll<
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
            >('button,input,select,textarea')
            .forEach((node) => {
              node.disabled = false;
            });
          window.DojiPortalSelect.refresh(decision);
          dialog.querySelector<HTMLButtonElement>('#businessReviewApply')!.disabled = stale;
        }
      }
    };
  }
  async function open(id: string, trigger: Element | null = document.activeElement) {
    if (!canRead() || pending) return;
    close(true);
    returnFocus = trigger;
    const stamp = generation,
      auth = epoch();
    dialog.innerHTML =
      '<header class="drawerHeader"><h2 id="businessReviewTitle">Loading application…</h2><button type="button" class="drawerCloseButton">Close</button></header><p role="status"></p>';
    dialog.querySelector('button')!.onclick = () => close();
    window.DojiRecordPages?.show(dialog, { close: () => close(), busy: () => pending });
    if (!dialog.open) dialog.showModal();
    try {
      const item = await client.detail(id);
      if (!valid(stamp, auth)) return;
      if (item?.id !== id) throw Error('The returned application identity could not be verified.');
      show(item);
      dialog.querySelector('h2')!.focus();
    } catch (cause) {
      const error = failure(cause);
      if (valid(stamp, auth)) feedback(error.message);
    }
  }
  async function load() {
    if (!canRead()) return;
    if (loading) {
      loadAgain = true;
      return;
    }
    loading = true;
    const stamp = ++queueGeneration,
      auth = epoch();
    const current = () => stamp === queueGeneration && auth === epoch() && canRead();
    root.innerHTML = '<div class="panelHeader"><h3>Business applications</h3></div><div class="tableWrap" aria-busy="true"><div class="queueState" role="status">Loading applications…</div></div><div class="tableFooter"><span>Loading</span><div><button class="portalButton" disabled>Previous</button><button class="portalButton" disabled>Next</button></div></div>';
    try {
      const page = await client.page({
        p_state: filter,
        p_limit: 25,
        p_after_at: cursor?.at ?? null,
        p_after_id: cursor?.id ?? null,
      });
      if (!current()) return;
      if (!Array.isArray(page?.items) || page.items.length > 25)
        throw Error('The application queue could not be verified.');
      next = page.next_cursor;
      root.innerHTML = `<div class="panelHeader"><div class="editorialFilter"><label for="businessQueueState">Application status</label><select id="businessQueueState">${['pending', 'changes_requested', 'approved', 'declined'].map((value) => `<option value="${value}"${filter === value ? ' selected' : ''}>${businessStateLabel(value)}</option>`).join('')}</select></div><button class="portalButton" type="button" data-refresh>Refresh applications</button></div><div class="queuePageSummary"><span><strong>${page.items.length}</strong> applications on this page</span><span>${escape(businessStateLabel(filter))} · not queue-wide totals</span></div><div class="tableWrap"><table class="queueTable"><thead><tr><th>Business</th><th>Reference</th><th>Status</th></tr></thead><tbody>${page.items.map((item) => `<tr tabindex="0" data-application-row="${escape(item.id)}" aria-label="Review ${escape(item.brand_name || 'business application')}"><td><button type="button" class="textButton" data-application-id="${escape(item.id)}">${escape(item.brand_name || 'Business application')}</button></td><td>${escape(item.id.slice(0, 8).toUpperCase())}</td><td><span class="statusPill">${escape(businessStateLabel(item.state))}</span></td></tr>`).join('') || '<tr class="emptyTableRow"><td colspan="3"><div class="queueState">No applications match this view.</div></td></tr>'}</tbody></table></div><div class="tableFooter"><span role="status">Page ${previous.length + 1} · ${page.items.length} shown · up to 25 per page</span><div><button type="button" class="portalButton" data-first${!previous.length ? ' disabled' : ''}>Previous</button><button type="button" class="portalButton" data-next${!next ? ' disabled' : ''}>Next</button></div></div>`;
      const select = root.querySelector('select')!;
      window.DojiPortalSelect.enhance(select, true);
      select.onchange = () => {
        filter = select.value;
        cursor = null;
        previous.length = 0;
        void load();
      };
      root.querySelectorAll<HTMLElement>('[data-application-row]').forEach((row) => {
        row.onclick = (event) => void open(row.dataset.applicationRow!, event.target instanceof HTMLElement && event.target.closest('button') || row);
        row.onkeydown = (event) => {
          if (event.target === row && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            void open(row.dataset.applicationRow!, row);
          }
        };
      });
      root.querySelector<HTMLButtonElement>('[data-first]')!.onclick = () => {
        cursor = previous.pop() ?? null;
        void load();
      };
      root.querySelector<HTMLButtonElement>('[data-refresh]')!.onclick = () => {
        void load();
      };
      root.querySelector<HTMLButtonElement>('[data-next]')!.onclick = () => {
        previous.push(cursor);
        cursor = next;
        void load();
      };
    } catch (cause) {
      const error = failure(cause);
      if (current()) {
        root.replaceChildren();
        const node = document.createElement('p');
        node.setAttribute('role', 'status');
        node.textContent = error.message;
        node.className = 'queueState';
        const viewport = document.createElement('div');
        viewport.className = 'tableWrap';
        viewport.append(node);
        root.append(viewport);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'portalButton';
        retry.textContent = 'Retry applications';
        retry.onclick = () => {
          void load();
        };
        const footer = document.createElement('div');
        footer.className = 'tableFooter queueErrorFooter';
        footer.append(retry);
        root.append(footer);
      }
    } finally {
      if (stamp === queueGeneration) {
        loading = false;
        if (loadAgain && current()) {
          loadAgain = false;
          void load();
        }
      }
    }
  }
  return {
    open,
    load,
    isOpen: () => dialog.open,
    async reconcile() {
      if (pending) return;
      if (reconciling) {
        reconcileAgain = true;
        return;
      }
      if (!dialog.open || !record) return load();
      const stamp = generation,
        auth = epoch(),
        id = record.id;
      reconciling = true;
      try {
        const latest = await client.detail(id);
        if (!valid(stamp, auth) || record?.id !== id) return;
        if (latest?.id !== id)
          throw Error('The returned application identity could not be verified.');
        if (latest.revision !== record.revision) {
          stale = true;
          feedback(
            'This case changed. Your notes are preserved. Close and reopen before deciding.',
          );
        }
      } catch (cause) {
        const error = failure(cause);
        if (valid(stamp, auth)) {
          stale = true;
          feedback(
            'The current case could not be verified. Your notes are preserved. Close and reopen before deciding.',
          );
        }
      } finally {
        if (valid(stamp, auth)) {
          reconciling = false;
          if (reconcileAgain) {
            reconcileAgain = false;
            void this.reconcile();
          }
        }
      }
    },
    clear() {
      close(true);
      queueGeneration++;
      pending = loading = reconciling = loadAgain = reconcileAgain = false;
      cursor = next = null;
      previous.length = 0;
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
