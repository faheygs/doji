/* Restricted intake, separately enabled only after backend qualification. */
import type {
  SafetyCase,
  SafetyCommand,
  SafetyCursor,
  SafetyOptions,
} from './safety-contracts.d.mts';
type Control =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLButtonElement
  | HTMLFieldSetElement;
function failureMessage(error: unknown) {
  return error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : '';
}
function fieldControl(form: HTMLFormElement, name: string) {
  const control = form.elements.namedItem(name);
  if (
    !(
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    )
  )
    throw Error(`Missing safety form field: ${name}`);
  return control;
}
function formControls(root: HTMLElement) {
  return [
    ...root.querySelectorAll<Control>(
      'form input,form textarea,form select,form button,form fieldset,.caseOutcomeBar button',
    ),
  ];
}
(() => {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => entities[c]!);
  const date = (v: string) =>
    Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString() : 'Unavailable';
  const labels: Readonly<Record<string, string>> = {
    received: 'Received',
    reviewing: 'Under review',
    needs_information: 'More information needed',
    removed: 'Removal completed',
    not_actionable: 'Not actionable',
    claim: 'Assigned to reviewer',
    link_report: 'Moderation report linked',
    reopen: 'Review reopened',
  };
  const actionLabel = (value: unknown) =>
    (typeof value === 'string' ? labels[value] : undefined) ||
    String(value || 'Case updated')
      .replaceAll('_', ' ')
      .replace(/^./, (c) => c.toUpperCase());
  const commandLabels: Readonly<Record<string, string>> = {
    claim: 'Assign to me',
    reviewing: 'Start review',
    needs_information: 'Request information',
    removed: 'Record removal',
    not_actionable: 'Close request',
    reopen: 'Reopen request',
    link_report: 'Link report',
  };
  function create({
    client,
    session,
    epoch,
    enhanceControls,
    openReport,
    view = 'safety',
    detailOnly = false,
  }: SafetyOptions) {
    const queue = view === 'safety' ? 'restricted_safety' : 'moderation';
    const host = document.createElement('article');
    host.className = 'portalPanel safetyQueue';
    host.setAttribute('aria-label', 'External removal requests');
    host.hidden = detailOnly;
    document.querySelector(`[data-portal-view="${view}"]`)!.append(host);
    const intro =
      view === 'safety' &&
      document.querySelector('[data-portal-view="safety"] .viewIntro p:last-child');
    if (intro)
      intro.textContent =
        'High-risk reports, appeals and external removal requests. Restricted access only.';
    const dialog = document.createElement('dialog');
    dialog.className =
      'portalModal editorialDialog safetyRemovalDialog portalDrawer adminDrawer open';
    dialog.setAttribute('aria-labelledby', 'safetyCaseTitle');
    document.body.append(dialog);
    let revision = 0,
      detailRevision = 0,
      cursor: SafetyCursor | null = null,
      next: SafetyCursor | null = null,
      closed = false,
      busy = false,
      active: string | null = null,
      intent: (SafetyCommand & { method: 'report' | 'workflow'; fingerprint: string }) | null =
        null,
      returnFocus: Element | null = null,
      pageBusy = false,
      displayedRevision: number | null = null,
      stale = false,
      reconciling = false,
      reconcilePending = false,
      restoreConfirmation: (() => void) | null = null;
    const previous: (SafetyCursor | null)[] = [];
    const permitted = () =>
      (queue === 'moderation' || session()?.capabilities?.legal_read === true) &&
      session()?.capabilities?.moderation_read === true;
    const current = (stamp: number) => stamp === epoch() && permitted() && client.hasSession();
    const visible = () =>
      !document.querySelector<HTMLElement>(`[data-portal-view="${view}"]`)!.hidden;
    function close(force = false) {
      if (busy && !force) return;
      ++detailRevision;
      active = null;
      displayedRevision = null;
      stale = false;
      reconcilePending = false;
      intent = null;
      restoreConfirmation = null;
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
    let backdropPointer = false;
    const outside = (event: PointerEvent) => {
      const box = dialog.getBoundingClientRect();
      return (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      );
    };
    dialog.addEventListener('pointerdown', (event) => {
      backdropPointer = outside(event);
    });
    dialog.addEventListener('pointerup', (event) => {
      if (backdropPointer && outside(event)) close();
      backdropPointer = false;
    });
    function feedback(message: string, error = false) {
      const el = dialog.querySelector<HTMLElement>('[data-feedback]');
      if (el) {
        el.textContent = message;
        el.classList.toggle('error', error);
        el.focus();
      }
    }
    function frame(body: string) {
      restoreConfirmation = null;
      dialog.className =
        'portalModal editorialDialog safetyRemovalDialog portalDrawer adminDrawer open';
      dialog.innerHTML = `<header class="drawerHeader"><h2 id="safetyCaseTitle" tabindex="-1">Removal request</h2><button class="drawerCloseButton" type="button" data-close>Close</button></header><div class="editorialDrawerContent">${body}<p class="editorialFeedback" data-freshness role="status"></p><p class="editorialFeedback" data-feedback role="status" tabindex="-1"></p></div>`;
      dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => close();
      window.DojiRecordPages?.sync(dialog);
    }
    function showConfirmation(section: HTMLElement, controls: Control[]) {
      const body = dialog.querySelector<HTMLElement>('.editorialDrawerContent')!,
        header = dialog.querySelector('header')!,
        footer = dialog.querySelector<HTMLElement>('.caseOutcomeBar');
      if (footer) footer.hidden = true;
      section.remove();
      const saved = document.createDocumentFragment();
      while (body.firstChild) saved.append(body.firstChild);
      const feedbackNode = document.createElement('p');
      feedbackNode.className = 'editorialFeedback';
      feedbackNode.dataset.feedback = '';
      feedbackNode.setAttribute('role', 'status');
      feedbackNode.tabIndex = -1;
      const freshnessNode = document.createElement('p');
      freshnessNode.className = 'editorialFeedback';
      freshnessNode.dataset.freshness = '';
      freshnessNode.setAttribute('role', 'status');
      body.append(section, freshnessNode, feedbackNode);
      body.className = 'modalBody';
      header.className = 'modalHeader';
      dialog.classList.remove('portalDrawer', 'adminDrawer', 'open');
      window.DojiRecordPages?.modal(dialog);
      restoreConfirmation = () => {
        body.replaceChildren(saved);
        body.className = 'editorialDrawerContent';
        header.className = 'drawerHeader';
        dialog.classList.add('portalDrawer', 'adminDrawer', 'open');
        window.DojiRecordPages?.show(dialog, { close: () => close(), busy: () => busy });
        if (footer) footer.hidden = false;
        controls.forEach((e) => (e.disabled = false));
        restoreConfirmation = null;
        body.querySelector<HTMLElement>('[data-freshness]')!.textContent =
          freshnessNode.textContent;
        if (stale)
          dialog
            .querySelectorAll<HTMLButtonElement>('button[type="submit"]')
            .forEach((button) => (button.disabled = true));
      };
      section.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => {
        restoreConfirmation?.();
        dialog.querySelector('h2')!.focus();
      };
      section.querySelector<HTMLButtonElement>('[data-confirm]')!.focus();
    }
    const field = (key: string, label: string, value: unknown, multiline = false) =>
      `<div class="field full"><label for="safety-${key}">${escape(label)}</label>${multiline ? `<textarea id="safety-${key}" rows="3" readonly>${escape(value)}</textarea>` : `<input id="safety-${key}" value="${escape(value)}" readonly>`}</div>`;
    function renderCase(c: SafetyCase) {
      displayedRevision = c.revision;
      stale = false;
      const req = c.request || {};
      const tax = c.classification || {};
      const overdue = !c.closed_at && Date.parse(c.deadline_at) < Date.now();
      const assignee = c.assigned_to === null
        ? 'Unassigned'
        : c.assigned_to === undefined
          ? 'Unavailable'
          : c.assigned_to === session()?.user_id
            ? 'Assigned to you'
            : `Employee ${c.assigned_to}`;
      frame(`<p class="eyebrow">External intake · ${c.queue === 'moderation' ? 'Trust & safety' : 'Restricted safety'}</p><p>${escape(c.id)}</p><p class="statusPill ${overdue ? 'urgent' : ''}">${escape(labels[c.state] || c.state)}${overdue ? ' · Overdue' : ''}</p><p>Received ${escape(date(c.received_at))}<br>${req.detail === 'nonconsensual_intimate_images' ? '48-hour removal review target' : '24-hour internal review target'}: ${escape(date(c.deadline_at))}</p>
    <div class="formGrid">${field('assignee', 'Assignee', assignee)}</div>
    <p class="editorialConsequence">A request is an allegation, not a finding. The deadline does not restart while awaiting clarification. Never download or forward suspected illegal imagery.</p>
    <div class="formGrid">${field('category', 'Category', tax.reason_label || req.reason)}${field('reason', 'Specific concern', tax.detail_label || req.detail)}${field('name', 'Requester', req.name)}${field('contact', 'Safe contact', req.contact)}${field('relationship', 'Submitted by', req.relationship === 'representative' ? 'Authorized representative' : req.relationship === 'witness' ? 'Third-party concern' : 'Affected person')}${field('location', 'Original content location', req.location, true)}${field('statement', 'Good-faith statement', req.statement, true)}${field('signature', 'Electronic signature', req.signature)}${field('public', 'Current requester-visible response', c.public_message, true)}${field('report', 'Linked moderation report', c.report_id || 'Not linked')}</div>
    <p>Operator alert: ${escape(c.alert_state || 'Unknown')}. Provider acceptance is not proof of inbox delivery.</p>
    ${c.report_id ? '<button class="portalButton" data-open-report type="button">Open linked moderation case</button>' : c.can_write && !c.closed_at ? `<section class="detailBlock"><h3>Identify the exact content</h3><p>Locate the content using the original submission. Do not infer an ID from similar wording. Inspection alone takes no moderation action.</p><form data-target><div class="formGrid"><div class="field full"><label for="safetyKind">Content type</label><select id="safetyKind" name="kind"><option value="post">Post</option><option value="profile_photo">Profile photo</option><option value="comment">Comment</option><option value="poll_response">Poll response</option></select></div><div class="field full"><label for="safetyTargetId">Exact content ID</label><input id="safetyTargetId" name="target_id" required maxlength="36" pattern="[a-fA-F0-9-]{36}" autocomplete="off"></div></div><button class="portalButton" type="submit">Inspect content</button></form><div data-target-preview></div></section>` : ''}
    ${c.can_write ? `<form data-command><div class="formGrid"><div class="field full"><label for="safetyAction">Action</label><select id="safetyAction" name="action">${c.closed_at ? '<option value="reopen">Reopen request</option>' : !c.assigned_to ? '<option value="claim">Assign to me</option>' : '<option value="reviewing">Start review</option><option value="needs_information">Request information</option><option value="removed">Record removal</option><option value="not_actionable">Close request</option>'}</select></div><div class="field full" data-link hidden><label for="safetyReport">Exact report ID</label><input id="safetyReport" name="report_id" maxlength="36"></div><div class="field full"><label for="safetyNote">Internal rationale</label><textarea id="safetyNote" name="note" minlength="10" maxlength="2000" required></textarea></div><div class="field full"><label for="safetyMessage">Response visible to the requester</label><textarea id="safetyMessage" name="message" maxlength="2000"></textarea><small>Never include another person’s private information, internal evidence or media links. Required for clarification, closure and reopening.</small></div><div class="field full" data-removal hidden><div data-copies><label for="safetyCopies">Identical-copy investigation</label><textarea id="safetyCopies" name="copies_review" maxlength="2000"></textarea></div><label for="safetyAccess">Old URL / public access verification</label><textarea id="safetyAccess" name="access_review" maxlength="2000"></textarea><small>Record what was checked and removed. A hidden feed row alone is not proof of revoked media access.</small></div></div><div class="editorialActions"><button class="portalButton primary" type="submit">Assign to me</button></div></form>` : ''}
    <h3 class="historySectionLabel">Case history · most recent 30 entries</h3><div class="drawerTimeline safetyHistory">${(c.history || []).map((h) => `<div><span aria-hidden="true"></span><p><strong>${escape(actionLabel(h.action))}</strong><small>${escape(date(h.occurred_at))}</small>${h.internal_note ? `<small>Internal rationale: ${escape(h.internal_note)}</small>` : ''}${h.public_message ? `<small>Requester response: ${escape(h.public_message)}</small>` : ''}</p></div>`).join('') || '<p class="emptyState">No workflow activity has been recorded.</p>'}</div>`);
      const kindSelect = dialog.querySelector<HTMLSelectElement>('#safetyKind');
      if (kindSelect) {
        kindSelect.add(new Option('Account', 'account'));
        if (tax.targets)
          for (const item of [...kindSelect.options])
            if (!tax.targets.includes(item.value)) item.remove();
      }
      enhanceControls(dialog);
      const outcomes = document.createElement('footer');
      outcomes.className = 'caseOutcomeBar';
      outcomes.setAttribute('aria-label', 'Case actions');
      outcomes.innerHTML = c.can_write
        ? ''
        : '<h3>Read-only access</h3><p>Your current permissions do not allow changes to this request. An authorized moderation reviewer must record its outcome; viewing it does not close it.</p>';
      // Keep actions outside the scrolling evidence/form body, but keep the submit
      // button associated with its original form so native validation still runs.
      const commandForm = dialog.querySelector<HTMLFormElement>('[data-command]');
      if (commandForm) {
        commandForm.id = `safety-command-${view}`;
        const submitRow = commandForm.querySelector<HTMLElement>('.editorialActions')!;
        submitRow.querySelector('button')!.setAttribute('form', commandForm.id);
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'portalButton';
        cancel.textContent = 'Cancel';
        cancel.onclick = () => close();
        submitRow.prepend(cancel);
        outcomes.append(submitRow);
      }
      dialog.append(outcomes);
      wireTarget(c);
      const linkedButton = dialog.querySelector<HTMLButtonElement>('[data-open-report]');
      if (linkedButton)
        linkedButton.onclick = async () => {
          const stamp = epoch(),
            request = detailRevision;
          linkedButton.disabled = true;
          try {
            const detail = await client.reportCase(c.report_id!);
            if (!current(stamp) || request !== detailRevision) return;
            if (detail.id !== c.report_id)
              throw new Error('Linked report identity could not be verified.');
            close();
            openReport(detail);
          } catch (error) {
            if (current(stamp) && request === detailRevision) {
              feedback(failureMessage(error) || 'Linked report unavailable.', true);
              linkedButton.disabled = false;
            }
          }
        };
      const form = dialog.querySelector<HTMLFormElement>('[data-command]');
      if (!form) return;
      const action = fieldControl(form, 'action');
      const change = () => {
        const assign = action.value === 'claim';
        const submit = outcomes.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        submit.formNoValidate = assign;
        submit.textContent =
          commandLabels[action.value] || 'Continue';
        action.closest<HTMLElement>('.field')!.hidden = assign;
        for (const name of ['note', 'message']) {
          fieldControl(form, name).closest<HTMLElement>('.field')!.hidden = assign;
        }
        fieldControl(form, 'note').required = !assign;
        form.querySelector<HTMLElement>('[data-link]')!.hidden = action.value !== 'link_report';
        form.querySelector<HTMLElement>('[data-removal]')!.hidden = action.value !== 'removed';
        fieldControl(form, 'report_id').required = action.value === 'link_report';
        fieldControl(form, 'message').required = [
          'needs_information',
          'removed',
          'not_actionable',
          'reopen',
        ].includes(action.value);
        fieldControl(form, 'access_review').required = action.value === 'removed';
        form.querySelector<HTMLElement>('[data-copies]')!.hidden =
          req.detail !== 'nonconsensual_intimate_images';
        fieldControl(form, 'copies_review').required =
          action.value === 'removed' && req.detail === 'nonconsensual_intimate_images';
      };
      action.addEventListener('change', change);
      change();
      form.onsubmit = (event) => {
        event.preventDefault();
        if (busy || stale) return;
        if (action.value === 'claim') {
          // Ownership is not a moderation decision. Never attach decision drafts
          // or a requester-visible message to the one-click assignment command.
          const input = { action: 'claim', note: 'Self-assigned for review.' };
          const fingerprint = JSON.stringify([c.id, c.revision, input]);
          if (!intent || intent.fingerprint !== fingerprint)
            intent = { method: 'workflow', fingerprint, p_id: c.id,
              p_revision: c.revision, p_command_id: crypto.randomUUID(), p_input: input };
          const controls = formControls(dialog);
          controls.forEach((control) => (control.disabled = true));
          void commit(c, form, null, controls);
          return;
        }
        const input = Object.fromEntries(new FormData(form));
        if (input.action !== 'link_report') delete input.report_id;
        if (input.action !== 'removed') {
          delete input.copies_review;
          delete input.access_review;
        }
        const fingerprint = JSON.stringify([c.id, c.revision, input]);
        if (!intent || intent.fingerprint !== fingerprint)
          intent = {
            method: 'workflow',
            fingerprint,
            p_id: c.id,
            p_revision: c.revision,
            p_command_id: crypto.randomUUID(),
            p_input: input,
          };
        const controls = formControls(dialog);
        controls.forEach((e) => (e.disabled = true));
        const confirmation = document.createElement('section');
        confirmation.className = 'editorialConsequence';
        const label = commandLabels[String(input.action)] || 'Continue';
        confirmation.innerHTML = `<h3>Confirm: ${escape(label)}</h3><p>This records the case workflow only. It does not itself remove content or revoke a media URL.</p><p>Requester-visible response: ${escape(input.message || 'Unchanged')}</p><button type="button" class="portalButton primary" data-confirm>Confirm: ${escape(label)}</button> <button type="button" class="portalButton" data-cancel>Back</button>`;
        form.append(confirmation);
        confirmation.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => {
          confirmation.remove();
          controls.forEach((e) => (e.disabled = false));
        };
        confirmation.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick = () =>
          commit(c, form, confirmation, controls);
        showConfirmation(confirmation, controls);
      };
    }
    function wireTarget(c: SafetyCase) {
      const targetForm = dialog.querySelector<HTMLFormElement>('[data-target]');
      if (!targetForm) return;
      const previewHost = dialog.querySelector<HTMLElement>('[data-target-preview]')!;
      let inspection = 0;
      const changed = () => {
        ++inspection;
        previewHost.replaceChildren();
      };
      targetForm.addEventListener('input', changed);
      targetForm.addEventListener('change', changed);
      targetForm.onsubmit = async (event) => {
        event.preventDefault();
        if (busy) return;
        const stamp = epoch(),
          request = detailRevision,
          inspect = ++inspection;
        const kind = fieldControl(targetForm, 'kind').value,
          targetId = fieldControl(targetForm, 'target_id').value.trim();
        const button = targetForm.querySelector('button')!;
        button.disabled = true;
        previewHost.textContent = 'Inspecting exact content…';
        try {
          const target = await client.safetyTarget(c.id, kind, targetId);
          if (!current(stamp) || request !== detailRevision || inspection !== inspect) return;
          if (
            target.case_id !== c.id ||
            target.id !== targetId ||
            target.kind !== kind ||
            !/^[a-f0-9]{64}$/.test(target.fingerprint)
          )
            throw new Error('Content identity could not be verified.');
          previewHost.innerHTML = `<h4>Review target</h4><div class="formGrid">${field('target-type', 'Content type', kind)}${field('target-owner', 'Owner', target.username ? `@${target.username}` : target.owner_id)}${field('target-id', 'Verified content ID', target.id)}${field('target-text', 'Current content text', target.detail?.text, true)}${field('target-state', 'Current visibility', target.detail?.state)}${[
            'photo_ref',
            'front_photo_ref',
            'video_ref',
          ]
            .filter((k) => target.detail?.[k])
            .map((k) => field(k, k.replaceAll('_', ' '), target.detail?.[k], true))
            .join(
              '',
            )}</div><p class="editorialConsequence">${c.queue === 'moderation' ? 'Creating this report starts ordinary moderation review; content stays unchanged until a staff decision.' : 'Creating a restricted report quarantines the exact post, comment or poll response. Account and profile-photo review require a separate moderation decision.'} This does not ban the account or verify that old media URLs are inaccessible.</p><form data-handoff><div class="field full"><label for="safetyHandoffNote">Content identification rationale</label><textarea id="safetyHandoffNote" name="note" required minlength="10" maxlength="2000"></textarea></div><label><input type="checkbox" required> I verified this is the content identified in the external request.</label><button class="portalButton primary" type="submit">Review report creation</button></form>`;
          const handoff = previewHost.querySelector<HTMLFormElement>('[data-handoff]')!;
          handoff.onsubmit = (e) => {
            e.preventDefault();
            if (busy) return;
            const input = {
              kind,
              target_id: targetId,
              fingerprint: target.fingerprint,
              note: fieldControl(handoff, 'note').value.trim(),
            };
            const fingerprint = JSON.stringify(['report', c.id, c.revision, input]);
            if (!intent || intent.fingerprint !== fingerprint)
              intent = {
                method: 'report',
                fingerprint,
                p_id: c.id,
                p_revision: c.revision,
                p_command_id: crypto.randomUUID(),
                p_input: input,
              };
            const controls = formControls(dialog);
            controls.forEach((e) => (e.disabled = true));
            const confirmation = document.createElement('section');
            confirmation.className = 'editorialConsequence';
            confirmation.innerHTML = `<h3>Confirm ${c.queue === 'moderation' ? 'moderation' : 'restricted'} report</h3><p>Target: ${escape(kind)} · ${escape(targetId)} · ${escape(target.username || target.owner_id)}.</p><p>${c.queue === 'moderation' ? 'Create an ordinary moderation review without changing content visibility.' : ['profile_photo', 'account'].includes(kind) ? 'Create a restricted review without automatic account or photo removal.' : 'Create a restricted review and quarantine this exact content.'} No account ban will be applied.</p><button type="button" class="portalButton primary" data-confirm>Create ${c.queue === 'moderation' ? 'moderation' : 'restricted'} report</button> <button type="button" class="portalButton" data-cancel>Back</button>`;
            handoff.append(confirmation);
            confirmation.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => {
              confirmation.remove();
              controls.forEach((e) => (e.disabled = false));
            };
            confirmation.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick = () =>
              commit(c, handoff, confirmation, controls);
            showConfirmation(confirmation, controls);
          };
        } catch (error) {
          if (current(stamp) && request === detailRevision && inspection === inspect) {
            previewHost.replaceChildren();
            feedback(failureMessage(error) || 'Exact content unavailable.', true);
          }
        } finally {
          if (current(stamp) && request === detailRevision) button.disabled = false;
        }
      };
    }
    async function commit(
      c: SafetyCase,
      form: HTMLFormElement,
      confirmation: HTMLElement | null,
      controls: Control[],
    ) {
      if (busy || !intent) return;
      if (stale) {
        feedback('This case has changed. Close and reopen it before confirming.', true);
        return;
      }
      const stamp = epoch(),
        request = detailRevision;
      busy = true;
      dialog.querySelector<HTMLButtonElement>('[data-close]')!.disabled = true;
      confirmation?.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const assigning = intent.p_input.action === 'claim';
      feedback(assigning ? 'Assigning to you…' : 'Saving…');
      try {
        const command =
          intent.method === 'report' ? client.safetyCreateReport : client.safetyCommand;
        const saved = await command({
          p_id: intent.p_id,
          p_revision: intent.p_revision,
          p_command_id: intent.p_command_id,
          p_input: intent.p_input,
        });
        if (!current(stamp) || request !== detailRevision) return;
        if (
          saved?.id !== c.id ||
          saved?.outcome !== 'saved' ||
          !Number.isSafeInteger(saved.revision)
        )
          throw new Error('Save could not be confirmed. Retry the same change.');
        intent = null;
        busy = false;
        await open(c.id, false);
        if (assigning && current(stamp) && active === c.id) feedback('Assigned to you.');
        if (current(stamp)) await load();
      } catch (error) {
        if (current(stamp) && request === detailRevision) {
          restoreConfirmation?.();
          feedback(
            failureMessage(error) || 'Save could not be confirmed. Retry the same change.',
            true,
          );
          confirmation?.remove();
          controls.forEach((e) => (e.disabled = false));
        }
      } finally {
        if (current(stamp) && request === detailRevision) {
          busy = false;
          dialog.querySelector<HTMLButtonElement>('[data-close]')!?.removeAttribute('disabled');
        }
      }
    }
    async function open(id: string, remember = true) {
      const stamp = epoch(),
        request = ++detailRevision;
      if (!current(stamp)) return;
      if (remember) returnFocus = document.activeElement;
      active = id;
      displayedRevision = null;
      stale = false;
      frame('<p>Loading external case…</p>');
      window.DojiRecordPages?.show(dialog, { close: () => close(), busy: () => busy });
      if (!dialog.open) dialog.showModal();
      try {
        const value = await client.safetyCase(id);
        if (!current(stamp) || request !== detailRevision) return;
        if (value.id !== id) throw new Error('Case identity mismatch. No actions are available.');
        renderCase(value);
        dialog.querySelector('h2')!.focus();
      } catch (error) {
        if (current(stamp) && request === detailRevision)
          feedback(failureMessage(error) || 'Case unavailable. Close and reopen to retry.', true);
      }
    }
    async function load() {
      if (detailOnly) { host.hidden = true; return; }
      host.hidden = !permitted();
      if (!permitted() || !visible()) return;
      const stamp = epoch(),
        request = ++revision;
      pageBusy = true;
      host.innerHTML = '<div class="panelHeader"><h3>External removal requests</h3></div><div class="tableWrap" aria-busy="true"><div class="queueState" role="status">Loading external requests…</div></div><div class="tableFooter"><span>Loading</span><div><button class="portalButton" disabled>Previous</button><button class="portalButton" disabled>Next</button></div></div>';
      try {
        const data = await client.safetyPage(cursor, closed, queue);
        if (!current(stamp) || request !== revision) return;
        next = data.next_cursor;
        host.innerHTML = `<div class="panelHeader"><div><h3>External removal requests</h3><p>${closed ? 'Closed' : 'Open'} requests · oldest first · separate from in-app reports</p></div><div class="queueTools"><button class="portalButton" data-filter>${closed ? 'Show open' : 'Show closed'}</button><button class="portalButton" data-refresh>Refresh</button></div></div><div class="queuePageSummary" aria-label="External requests on this page"><span><strong>${data.items.length}</strong> requests on this page</span><span><strong>${closed ? '—' : data.items.filter(c => Date.parse(c.deadline_at) < Date.now()).length}</strong> overdue on this page</span><span>${closed ? 'Closed history' : 'Open requests'} · not queue-wide totals</span></div><div class="tableWrap"><table class="queueTable"><thead><tr><th>Reference</th><th>Category / reason</th><th>Received</th><th>Review target</th><th>Status</th></tr></thead><tbody>${data.items.length ? data.items.map((c) => `<tr data-case-row="${escape(c.id)}" tabindex="0" aria-label="Open request ${escape(c.id.slice(0, 8).toUpperCase())}"><td><button class="textButton" data-case="${escape(c.id)}">${escape(c.id.slice(0, 8).toUpperCase())}</button></td><td>${escape(c.reason_label || c.reason || 'Unavailable')}<br>${escape(c.detail_label || c.detail || '')}</td><td>${escape(date(c.received_at))}</td><td>${!closed && Date.parse(c.deadline_at) < Date.now() ? '<strong class="statusPill urgent">Overdue</strong> ' : ''}${escape(date(c.deadline_at))}</td><td><span class="statusPill">${escape(labels[c.state] || c.state)}</span></td></tr>`).join('') : '<tr class="emptyTableRow"><td colspan="5"><div class="queueState">No requests match this view.</div></td></tr>'}</tbody></table></div><div class="tableFooter"><span role="status">Page ${previous.length + 1} · ${data.items.length} shown · up to 25 per page</span><div><button class="portalButton" data-first ${previous.length ? '' : 'disabled'}>Previous</button><button class="portalButton" data-next ${next ? '' : 'disabled'}>Next</button></div></div>`;
        host.querySelector<HTMLButtonElement>('[data-refresh]')!.onclick = () => load();
        host.querySelector<HTMLButtonElement>('[data-filter]')!.onclick = () => {
          closed = !closed;
          cursor = null;
          previous.length = 0;
          load();
        };
        host.querySelector<HTMLButtonElement>('[data-first]')!.onclick = () => {
          cursor = previous.pop() ?? null;
          load();
        };
        host.querySelector<HTMLButtonElement>('[data-next]')!.onclick = () => {
          previous.push(cursor);
          cursor = next;
          load();
        };
        host.querySelectorAll<HTMLElement>('[data-case-row]').forEach((row) => {
          row.onclick = () => void open(row.dataset.caseRow!);
          row.onkeydown = (event) => {
            if (event.target === row && ['Enter', ' '].includes(event.key)) {
              event.preventDefault();
              void open(row.dataset.caseRow!);
            }
          };
        });
        return data;
      } catch (error) {
        if (current(stamp) && request === revision) {
          host.innerHTML = `<div class="panelHeader"><h3>External removal requests</h3></div><div class="tableWrap"><div class="queueState" role="alert">${escape(failureMessage(error) || 'Requests unavailable.')}</div></div><div class="tableFooter"><span>No outcome can be inferred from a failed read.</span><div><button class="portalButton">Retry</button></div></div>`;
          host.querySelector('button')!.onclick = () => load();
        }
      } finally {
        if (request === revision) pageBusy = false;
      }
    }
    document.addEventListener('portal:view', (event) => {
      if (event.detail === view) void load();
      else close();
    });
    async function reconcile() {
      if (reconciling) {
        reconcilePending = true;
        return;
      }
      reconciling = true;
      const stamp = epoch(),
        request = detailRevision,
        id = active;
      try {
        const data = !pageBusy ? await load() : null;
        if (
          !id ||
          busy ||
          displayedRevision === null ||
          !current(stamp) ||
          request !== detailRevision
        )
          return;
        // Reuse the existing bounded queue read. A closed/off-page case needs one
        // exact authorized read; never infer staleness from absence in a page.
        const latest = data?.items?.find((item) => item.id === id) || (await client.safetyCase(id));
        if (!current(stamp) || request !== detailRevision || busy) return;
        if (latest.id !== id || !Number.isSafeInteger(latest.revision))
          throw new Error('Unverified case revision');
        if (latest.revision > displayedRevision) stale = true;
        const notice = dialog.querySelector('[data-freshness]');
        if (notice)
          notice.textContent = stale
            ? 'This case has changed since you opened it. Your draft is preserved. Close and reopen to review the latest details before deciding.'
            : '';
        if (stale)
          dialog
            .querySelectorAll<HTMLButtonElement>(
              '[data-command] button[type="submit"], .caseOutcomeBar button[type="submit"], [data-handoff] button[type="submit"], [data-confirm]',
            )
            .forEach((button) => (button.disabled = true));
      } catch {
        if (current(stamp) && request === detailRevision && !busy) {
          const notice = dialog.querySelector('[data-freshness]');
          if (notice)
            notice.textContent = stale
              ? 'This case has changed. Your draft is preserved. Close and reopen before deciding.'
              : 'Could not check for newer case details. Your draft is preserved. Close and reopen to retry.';
        }
      } finally {
        reconciling = false;
        if (reconcilePending) {
          reconcilePending = false;
          if (current(stamp)) void reconcile();
        }
      }
    }
    return {
      open: (id: string) => { if (!permitted()) throw Error('External review access unavailable'); return open(id); },
      reconcile,
      clear() {
        ++revision;
        pageBusy = false;
        busy = false;
        cursor = null;
        previous.length = 0;
        next = null;
        close(true);
        host.replaceChildren();
        host.hidden = true;
      },
    };
  }
  window.DojiSafetyRemoval = { create };
})();
