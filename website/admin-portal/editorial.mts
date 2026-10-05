/* Employee-only editorial UI. No timers, member auth, direct DB writes or storage. */
import type {
  EditorialContent,
  EditorialItem,
  EditorialCommand,
  EditorialOptions,
  EditorialPage,
  DraftFields,
  IdeaResponse,
} from './editorial-contracts.d.mts';
function failureMessage(error: unknown) {
  return error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : '';
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function formControl(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null;
}
(() => {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  const escape = (value: unknown) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => entities[char]!);
  const date = (value: string | undefined) =>
    value && Number.isFinite(Date.parse(value))
      ? new Date(value).toLocaleString(undefined, { timeZoneName: 'short' })
      : '—';
  const stateLabel = (value: string) =>
    (
      ({
        approved: 'Accepted',
        rejected: 'Declined',
        pending: 'Pending review',
        live: 'Live',
        scheduled: 'Scheduled',
        draft: 'Draft',
        cancelled: 'Cancelled',
        expired: 'Expired',
        legacy: 'Legacy · read only',
        disabled: 'Disabled',
      }) as Readonly<Record<string, string>>
    )[value] || 'Unavailable';
  const localDate = (value: string | Date | undefined) => {
    const d = new Date(value ?? '');
    if (!Number.isFinite(d.getTime())) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const button = (action: string, label: unknown, primary = false) =>
    `<button type="button" class="portalButton${primary ? ' primary' : ''}" data-editorial-action="${action}">${escape(label)}</button>`;
  // Mirror the existing Suggest a Doji choices; never infer kind from prompt text.
  const ideaKindLabel = (kind: string | undefined) =>
    (
      ({
        poll: 'Poll',
        wyr: 'Would you rather',
        question: 'Question',
        format_question: 'Format question',
        photo_idea: 'Photo idea',
      }) as Readonly<Record<string, string>>
    )[kind || ''] || 'Unrecognized submission type';
  function ideaResponse(item: EditorialContent): IdeaResponse {
    const choices = item.options;
    if (item.kind === 'poll' || item.kind === 'wyr') {
      const valid =
        Array.isArray(choices) &&
        choices.length >= 2 &&
        choices.length <= 8 &&
        (item.kind !== 'wyr' || choices.length === 2) &&
        choices.every(
          (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 100,
        );
      return valid
        ? { label: 'Choose one option', choices }
        : {
            error:
              'The submitted choices are incomplete or unsupported. Verify the original submission before accepting.',
          };
    }
    if (item.kind === 'format_question') {
      const rule = record(choices) && record(choices.answer_rule) ? choices.answer_rule : {};
      if (rule?.type === 'exact_word_count' && /^(?:[1-9]|1[0-9]|20)$/.test(String(rule.count)))
        return { label: 'Exact word count', count: rule.count };
      if (
        rule?.type === 'starts_with_letter' &&
        typeof rule.letter === 'string' &&
        /^[A-Za-z]$/.test(rule.letter)
      )
        return { label: 'Starts with letter', letter: rule.letter };
      return {
        error:
          'The submitted answer format is missing or unsupported. Verify the original submission before accepting.',
      };
    }
    if (item.kind === 'question' || item.kind === 'photo_idea') {
      if (!Array.isArray(choices) || choices.length !== 0)
        return {
          error:
            'The saved response details do not match the submitted type. Verify the original submission before accepting.',
        };
      return { label: item.kind === 'question' ? 'Free-text answer' : 'Photo response' };
    }
    return {
      error:
        'This submission type is not supported for review. Verify the original submission before accepting.',
    };
  }
  function ideaPreview(item: EditorialContent) {
    const response = ideaResponse(item);
    const field = (key: string, label: string, value: unknown, multiline = false, full = false) =>
      `<div class="field${full ? ' full' : ''}"><label for="ideaSubmission-${key}">${escape(label)}</label>${
        multiline
          ? `<textarea id="ideaSubmission-${key}" rows="${full ? 4 : 2}" readonly>${escape(value)}</textarea>`
          : `<input id="ideaSubmission-${key}" type="text" value="${escape(value)}" readonly>`
      }</div>`;
    return `<section class="editorialSubmission" aria-label="Original submission">
      <p class="eyebrow">Original submission · ${escape(String(item.id).slice(0, 8).toUpperCase())} · Read only</p>
      <div class="formGrid">
        ${field('type', 'Type', ideaKindLabel(item.kind))}
        ${field('response', item.kind === 'format_question' ? 'Answer format' : 'Response format', response.label || 'Needs verification')}
        ${field('question', item.kind === 'photo_idea' ? 'Photo prompt' : 'Question', item.body, true, true)}
        ${response.choices ? response.choices.map((value, index) => field(`choice-${index + 1}`, `Choice ${index + 1}`, value, true)).join('') : ''}
        ${response.count !== undefined ? field('count', 'Word count', response.count) : ''}
        ${response.letter !== undefined ? field('letter', 'Starting letter', response.letter) : ''}
      </div>
      ${response.error ? `<p class="editorialConsequence" role="note">${escape(response.error)}</p>` : ''}
    </section>`;
  }
  function create({
    client,
    session,
    epoch,
    onSaved,
    enhanceControls,
    campaignsEnabled = false,
  }: EditorialOptions) {
    const pages = new Map<string, EditorialPage>();
    let detailRevision = 0,
      pending = false,
      intent: EditorialCommand | null = null,
      active: { kind: string; id: string | null; item?: EditorialItem | null } | null = null,
      returnFocus: Element | null = null;
    const dialog = document.createElement('dialog');
    dialog.className = 'portalModal editorialDialog';
    dialog.setAttribute('aria-labelledby', 'editorialDialogTitle');
    document.body.append(dialog);
    const canRead = () => session()?.capabilities?.operations_read === true;
    const valid = (stamp: number) => stamp === epoch() && canRead() && client.hasSession();
    const canWrite = () => canRead() && session()?.capabilities?.operator_manage === true;
    const visible = () =>
      document.querySelector<HTMLElement>('[data-portal-view]:not([hidden])')?.dataset.portalView ||
      '';
    const enhance = () => {
      window.DojiContextualHelp?.enhance(dialog);
      enhanceControls(dialog);
    };
    function close(force = false) {
      if (pending && !force) return;
      ++detailRevision;
      active = null;
      intent = null;
      dialog.close();
      dialog.replaceChildren();
      if (!force && returnFocus instanceof HTMLElement && returnFocus.isConnected)
        returnFocus.focus();
    }
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    let backdropPointer = false;
    const outsideDrawer = (event: PointerEvent) => {
      if (event.target !== dialog || !dialog.classList.contains('portalDrawer')) return false;
      const bounds = dialog.getBoundingClientRect();
      return (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      );
    };
    dialog.addEventListener('pointerdown', (event) => {
      backdropPointer = outsideDrawer(event);
    });
    dialog.addEventListener('pointerup', (event) => {
      if (backdropPointer && outsideDrawer(event)) close();
      backdropPointer = false;
    });
    // Native dialog keeps focus trapping/inert background; shared drawer classes
    // give record inspection the same right-edge layout as other admin records.
    function shell(title: string, content: string, presentation = 'drawer') {
      const drawer = presentation === 'drawer';
      dialog.className = `portalModal editorialDialog${drawer ? ' portalDrawer adminDrawer open' : ''}`;
      dialog.innerHTML = `<header class="${drawer ? 'drawerHeader' : 'modalHeader'}"><h2 id="editorialDialogTitle" tabindex="-1">${escape(title)}</h2><button type="button" class="drawerCloseButton" data-editorial-action="close">Close</button></header><div class="${drawer ? 'editorialDrawerContent' : 'modalBody'}">${content}<p class="editorialFeedback" role="status" aria-live="polite" tabindex="-1"></p></div>`;
      dialog.querySelector<HTMLButtonElement>('[data-editorial-action="close"]')!.onclick = () =>
        close();
      enhance();
      dialog.scrollTop = 0;
      if (dialog.open) dialog.querySelector('h2')!.focus();
    }
    function feedback(message: string, error = false) {
      const node = dialog.querySelector<HTMLElement>('.editorialFeedback');
      if (!node) return;
      node.textContent = message;
      node.classList.toggle('error', error);
      node.focus();
    }
    for (const kind of ['announcements', 'suggestions']) {
      const section = document.querySelector(`[data-portal-view="${kind}"]`)!;
      // Retain old DOM IDs for the gated rollback view and existing renderers.
      for (const child of section.children) child.classList.add('editorialLegacyHidden');
      const host = document.createElement('div');
      host.className = 'editorialWorkspace';
      section.append(host);
      pages.set(kind, {
        host,
        cursors: [null],
        index: 0,
        next: null,
        items: [],
        revision: 0,
        loaded: false,
        loading: false,
        write: false,
        filter: 'all',
      });
      host.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const action =
          event.target.closest<HTMLElement>('[data-editorial-action]')?.dataset.editorialAction;
        const p = pages.get(kind)!;
        if (action === 'new' && p.write) edit(null);
        if (action === 'refresh') void load(kind, 0);
        if (action === 'next' && p.next && !p.loading) {
          p.cursors[p.index + 1] = p.next;
          void load(kind, p.index + 1);
        }
        if (action === 'previous' && p.index > 0 && !p.loading) void load(kind, p.index - 1);
        const id = (
          event.target.closest<HTMLElement>('[data-editorial-id]') ||
          event.target.closest('tbody tr')?.querySelector<HTMLElement>('[data-editorial-id]')
        )?.dataset.editorialId;
        if (id && !p.loading) void open(kind, id);
      });
      host.addEventListener('change', (event) => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        if (!event.target.matches('[data-editorial-filter]')) return;
        const p = pages.get(kind)!;
        p.filter = event.target.value;
        p.cursors = [null];
        void load(kind, 0);
      });
      render(kind);
    }
    function render(kind: string, message = '', error = false) {
      const p = pages.get(kind)!;
      const announcements = kind === 'announcements';
      p.host.innerHTML = `<div class="viewIntro"><div><p class="eyebrow">${announcements ? 'Member communication' : 'Community programming'}</p><h2>${announcements ? 'Announcements' : 'Community ideas'}</h2><p>${announcements ? 'Draft, preview, and deliberately publish in-app messages.' : 'Review the exact submitted prompt and choices.'}</p></div>${announcements && p.write ? button('new', 'New announcement', true) : ''}</div>
        <article class="portalPanel editorialTablePanel"><div class="panelHeader"><div class="editorialFilter"><label for="editorial-filter-${kind}">Status</label><select id="editorial-filter-${kind}" data-editorial-filter>${(announcements
          ? [
              ['all', 'All announcements'],
              ['draft', 'Drafts'],
              ['published', 'Published'],
              ['cancelled', 'Cancelled'],
            ]
          : [
              ['all', 'All ideas'],
              ['pending', 'Pending review'],
              ['approved', 'Accepted'],
              ['rejected', 'Declined'],
            ]
        )
          .map(
            ([key, label]) =>
              `<option value="${key}" ${p.filter === key ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select></div>${button('refresh', 'Refresh')}</div>
        <p class="editorialPageStatus${error ? ' error' : ''}" role="status">${escape(message || (p.loading ? 'Loading…' : p.loaded ? '' : 'Open this view to load records.'))}</p>
        <div class="tableWrap"><table class="queueTable"><thead><tr><th scope="col">${announcements ? 'Message' : 'Idea'}</th><th scope="col">${announcements ? 'Window' : 'Submitted by'}</th><th scope="col">Status</th><th scope="col">Created</th></tr></thead><tbody>${p.items.map((item) => `<tr><td><button type="button" class="editorialRecord" data-editorial-id="${escape(item.id)}">${escape(item.title)}</button>${!announcements ? `<small>${escape(ideaKindLabel(item.kind))}</small>` : ''}</td><td>${announcements ? `${escape(date(item.starts_at))}<small>to ${escape(date(item.ends_at))}</small>` : escape(item.author)}</td><td><span class="statusPill ${['live', 'approved'].includes(item.display_state) ? 'approved' : ''}">${escape(stateLabel(item.display_state))}</span></td><td>${escape(date(item.created_at))}</td></tr>`).join('') || `<tr><td colspan="4">${p.loading ? 'Loading records…' : p.loaded && !error ? 'No records yet.' : 'Records are not available.'}</td></tr>`}</tbody></table></div>
        <footer class="tableFooter"><span>Page ${p.index + 1} · ${p.items.length} records</span><div>${button('previous', 'Previous')}${button('next', 'Next')}</div></footer></article>`;
      p.host.querySelector<HTMLButtonElement>('[data-editorial-action="previous"]')!.disabled =
        p.loading || p.index === 0;
      p.host.querySelector<HTMLButtonElement>('[data-editorial-action="next"]')!.disabled =
        p.loading || !p.next;
      p.host.querySelector<HTMLButtonElement>('[data-editorial-action="refresh"]')!.disabled =
        p.loading;
      p.host.querySelector<HTMLSelectElement>('[data-editorial-filter]')!.disabled = p.loading;
      p.host.querySelectorAll('tbody tr:has([data-editorial-id])').forEach((row) => {
        row.classList.add('editorialRecordRow');
      });
      enhanceControls(p.host);
    }
    async function load(kind: string, index = 0) {
      if (!canRead() || !pages.has(kind)) return;
      const p = pages.get(kind)!;
      const revision = ++p.revision;
      const stamp = epoch();
      p.loading = true;
      p.items = [];
      p.write = canWrite();
      render(kind);
      try {
        const result = await client.editorialPage(kind, p.cursors[index], p.filter);
        if (!valid(stamp) || revision !== p.revision) return;
        p.items = Array.isArray(result.items) ? result.items : [];
        p.next = result.next_cursor;
        p.index = index;
        p.write = canWrite() && result.can_write === true;
        p.loaded = true;
        p.loading = false;
        render(kind);
      } catch (error) {
        if (!valid(stamp) || revision !== p.revision) return;
        p.loading = false;
        p.loaded = false;
        p.next = null;
        p.write = false;
        render(kind, `Could not load records. ${failureMessage(error) || 'Please retry.'}`, true);
      }
    }
    async function open(kind: string, id: string) {
      if (!canRead() || pending) return;
      const revision = ++detailRevision;
      const stamp = epoch();
      if (!dialog.open) returnFocus = document.activeElement;
      active = { kind, id };
      intent = null;
      shell('Loading record', '<p>Loading the authoritative record…</p>');
      if (!dialog.open) dialog.showModal();
      try {
        const item = await client.editorialItem(kind, id);
        if (!valid(stamp) || revision !== detailRevision) return;
        if (!item || item.id !== id)
          throw Error(
            'The returned record does not match the selected submission. Refresh and try again.',
          );
        active = { kind, id, item };
        showDetail(item);
      } catch (error) {
        if (!valid(stamp) || revision !== detailRevision) return;
        shell('Record unavailable', button('reload', 'Retry'));
        dialog.querySelector<HTMLButtonElement>('[data-editorial-action="reload"]')!.onclick = () =>
          open(kind, id);
        feedback(failureMessage(error) || 'Could not load this record.', true);
      }
    }
    function preview(item: EditorialContent) {
      const reward =
        item.reward_action === 'submit_idea'
          ? `<p class="editorialRewardTerms">Submit a valid new Doji idea by ${escape(date(item.ends_at))} to earn ${escape(item.reward_sparks)} Sparks. Once per member for this campaign. No CTA click required.</p>`
          : '';
      return `<article class="editorialPreview"><p class="eyebrow">In-app content preview</p><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p>${reward}<div>${item.cta_label ? `<span class="editorialPreviewCta">${escape(item.cta_label)}</span>` : ''}<span>Not now</span></div><small>Content preview only; the app uses the member’s theme and native dialog.</small></article>`;
    }
    function showDetail(item: EditorialItem, notice = '') {
      const kind = active!.kind;
      const announcement = kind === 'announcements';
      const writable = canWrite() && item.can_write === true;
      const actions = announcement
        ? item.managed && item.state === 'draft'
          ? ['edit', 'publish', 'cancel']
          : item.managed && item.state === 'published'
            ? ['cancel']
            : []
        : Array.isArray(item.allowed_actions)
          ? item.allowed_actions.filter(
              (action) =>
                ['approved', 'rejected', 'pending'].includes(action) &&
                (action !== 'approved' || !ideaResponse(item).error),
            )
          : item.status === 'pending'
            ? ideaResponse(item).error
              ? ['rejected']
              : ['approved', 'rejected']
            : [];
      shell(
        announcement ? item.title : 'Review community idea',
        `
        <p><span class="statusPill">${escape(stateLabel(item.display_state))}</span></p>
        ${
          announcement
            ? `${preview(item)}<dl class="editorialFacts"><div><dt>Eligibility</dt><dd>All eligible signed-in members</dd></div><div><dt>Window</dt><dd>${escape(date(item.starts_at))} — ${escape(date(item.ends_at))}</dd></div><div><dt>Display limit</dt><dd>${escape(item.max_impressions_per_user)} impression(s) per account; ${escape(item.min_hours_between_impressions)} hours between impressions. Dismissal stops future claims.</dd></div><div><dt>Destination</dt><dd>${escape(item.cta_url || 'No action button')}</dd></div></dl>`
            : `${ideaPreview(item)}${item.admin_note ? `<p><strong>Decision rationale</strong><br>${escape(item.admin_note)}</p>` : ''}`
        }
        ${!announcement ? `<dl class="editorialFacts"><div><dt>Submitted</dt><dd>${escape(date(item.created_at))}</dd></div><div><dt>Submitter</dt><dd>${escape(item.author)}${item.username ? ` · @${escape(item.username)}` : ''}</dd></div><div><dt>Last reviewed</dt><dd>${escape(date(item.reviewed_at))}${item.reviewer ? ` · ${escape(item.reviewer)}` : ''}</dd></div><div><dt>Challenge pool</dt><dd>${item.pool_active === true ? 'Eligible for future selection' : item.pool_active === false ? 'Removed from future selection' : item.challenge_id ? 'Linked challenge — refresh for current eligibility' : 'No verified challenge link'}</dd></div>${item.scheduled_at ? `<div><dt>Scheduled Doji</dt><dd>${escape(date(item.scheduled_at))}</dd></div>` : ''}</dl>${item.review_blocked_reason ? `<p class="editorialConsequence" role="note">${escape(item.review_blocked_reason)}</p>` : ''}` : ''}
        ${writable && actions.length ? `<div class="field"><label for="editorialReason">Decision rationale${announcement ? '' : ' (member-visible)'}</label><textarea id="editorialReason" minlength="8" maxlength="1000" rows="3" required></textarea></div><div class="editorialActions">${actions.map((action) => button(action, { edit: 'Edit draft', publish: 'Review publication', cancel: 'Cancel announcement', approved: 'Accept into pool', rejected: item.status === 'approved' ? 'Reverse acceptance' : 'Decline idea', pending: 'Reopen for review' }[action], action === 'publish' || action === 'approved')).join('')}</div>` : ''}
        <details class="editorialHistory"><summary>Decision history and reference</summary><p>Reference: ${escape(item.id)}</p><p>Latest 20 events. Full history is in the audit log.</p><ol>${(item.recent_history || []).map((row) => `<li><strong>${escape({ approved: 'Accepted', rejected: 'Declined', pending: 'Reopened for review' }[String(row.action).replace('editorial.', '')] || String(row.action).replace('editorial.', ''))}</strong> · ${escape(date(row.occurred_at))}<p>${escape(row.reason)}</p></li>`).join('') || (Array.isArray(item.recent_history) ? '<li>No employee editorial history recorded.</li>' : '<li>Refresh this record to load its decision history.</li>')}</ol></details>${button('reload', 'Refresh record')}`,
      );
      dialog.querySelector<HTMLButtonElement>('[data-editorial-action="reload"]')!.onclick = () =>
        open(kind, item.id);
      for (const action of actions) {
        const control = dialog.querySelector<HTMLButtonElement>(
          `[data-editorial-action="${action}"]`,
        );
        if (!control) continue;
        control.onclick = () => {
          if (action === 'edit') return edit(item);
          const reason = dialog.querySelector<HTMLTextAreaElement>('#editorialReason')!;
          if (!reason.reportValidity()) return;
          confirm(
            {
              kind,
              action,
              id: item.id,
              version: item.version,
              input: {},
              reason: reason.value.trim(),
            },
            item,
            () => {
              showDetail(item);
              dialog.querySelector<HTMLTextAreaElement>('#editorialReason')!.value = reason.value;
            },
          );
        };
      }
      if (notice) feedback(notice);
    }
    function edit(item: EditorialItem | null, restored: EditorialContent | null = null) {
      if (!canWrite() || pending) return;
      const value: EditorialContent = restored ||
        item || {
          title: '',
          body: '',
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 86400000).toISOString(),
          priority: 0,
          max_impressions_per_user: 1,
          min_hours_between_impressions: 24,
          reward_action: null,
          reward_sparks: 0,
        };
      active = { kind: 'announcements', id: item?.id || null, item };
      if (!dialog.open) returnFocus = document.activeElement;
      const field = (
        name: keyof EditorialContent,
        label: string,
        type = 'text',
        extra = '',
        guidance = '',
      ) =>
        `<div class="field"><label for="editorial-${name}">${escape(label)}</label>${guidance ? `<span data-context-help>${escape(guidance)}</span>` : ''}<input id="editorial-${name}" name="${name}" type="${type}" value="${escape(type === 'datetime-local' ? localDate(typeof value[name] === 'string' ? value[name] : undefined) : value[name])}" ${extra}></div>`;
      shell(
        item ? 'Edit draft' : 'New announcement',
        `<form id="editorialDraft"><div class="formGrid">
        ${field('title', 'Title', 'text', 'maxlength="100" required')}
        <div class="field full"><label for="editorial-body">Message</label><textarea id="editorial-body" name="body" rows="4" maxlength="600" required>${escape(value.body)}</textarea></div>
        ${field('starts_at', 'Starts at', 'datetime-local', 'required', campaignsEnabled ? 'Your local time zone. Only one published announcement can be eligible at a time. Overlapping windows are rejected; adjacent future windows are allowed.' : 'Your local time zone. Publishing a future start makes this a scheduled announcement.')}
        ${field('ends_at', 'Ends at', 'datetime-local', 'required')}
        ${field('cta_label', 'Action button label (optional)', 'text', 'maxlength="40"')}
        <div class="field"><label for="editorial-cta_url">Destination</label><select id="editorial-cta_url" name="cta_url"><option value="">No action button</option>${(campaignsEnabled
          ? [
              ['/(app)/profile/shop', 'Sparks shop'],
              ['/(app)/suggest-challenge', 'Suggest a Doji'],
            ]
          : [
              ['/(app)', 'Feed'],
              ['/(app)/profile', 'Profile'],
              ['/(app)/suggest-challenge', 'Suggest a Doji'],
            ]
        )
          .map(
            ([url, label]) =>
              `<option value="${url}" ${value.cta_url === url ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select></div>
        ${
          campaignsEnabled
            ? `<input type="hidden" name="priority" value="${escape(value.priority ?? 0)}">
        <div class="field full"><label for="editorial-reward-mode">Reward</label><select id="editorial-reward-mode" name="reward_mode"><option value="none">No reward</option><option value="completion" ${value.reward_action ? 'selected' : ''}>Sparks on completion</option></select></div>
        <div class="field" data-reward-fields><label for="editorial-reward-action">Completion action</label><select id="editorial-reward-action" name="reward_action"><option value="submit_idea">Submit a valid new Doji idea</option></select></div>
        <div class="field" data-reward-fields><label for="editorial-reward-sparks">Sparks awarded</label><span data-context-help>Once per member for this campaign after a valid new submission. Viewing, tapping or dismissing never pays. Existing approval rewards stay separate. Allowed range: 1–10,000 Sparks.</span><input id="editorial-reward-sparks" name="reward_sparks" type="number" min="1" max="10000" step="1" value="${escape(value.reward_sparks || '')}"></div>`
            : `<div class="field"><label for="editorial-priority">Display priority</label><span data-context-help>If multiple announcements are eligible, higher priority is claimed first. This does not send a push notification.</span><select id="editorial-priority" name="priority">${[
                [0, 'Normal'],
                [10, 'Elevated'],
                [20, 'High'],
              ]
                .map(
                  ([key, label]) =>
                    `<option value="${key}" ${Number(value.priority) === key ? 'selected' : ''}>${label}</option>`,
                )
                .join('')}</select></div>`
        }
        ${field('max_impressions_per_user', 'Impressions per account', 'number', 'min="1" max="10" step="1" required', 'Maximum claims, not a guarantee of views. A member dismissal ends eligibility even if the cap is higher.')}
        ${field('min_hours_between_impressions', 'Hours between impressions', 'number', 'min="1" max="720" step="1" required')}
        <div class="field full"><label for="editorial-reason">Change rationale</label><textarea id="editorial-reason" name="reason" rows="2" minlength="8" maxlength="1000" required>${escape(value.reason || '')}</textarea></div></div>
        <div class="editorialActions">${button('preview', 'Preview')}<button type="submit" class="portalButton primary">Review draft save</button></div><div id="editorialPreviewSlot"></div></form>`,
        item ? 'drawer' : 'modal',
      );
      if (!dialog.open) dialog.showModal();
      const form = dialog.querySelector('form')!;
      const syncReward = () => {
        const reward = formControl(form, 'reward_mode')?.value === 'completion';
        form.querySelectorAll<HTMLElement>('[data-reward-fields]').forEach((node) => {
          node.hidden = !reward;
          node
            .querySelectorAll<
              HTMLInputElement | HTMLSelectElement | HTMLButtonElement
            >('input,select,button')
            .forEach((control) => {
              control.disabled = !reward;
            });
        });
        const sparks = formControl(form, 'reward_sparks');
        if (sparks) sparks.required = reward;
      };
      if (campaignsEnabled) {
        formControl(form, 'reward_mode')!.addEventListener('change', syncReward);
        syncReward();
      }
      const values = () => {
        // All fields in this owned form are text/select controls, never uploads.
        const data = Object.fromEntries(new FormData(form)) as unknown as DraftFields;
        if (campaignsEnabled) {
          const reward = data.reward_mode === 'completion';
          delete data.reward_mode;
          data.reward_action = reward ? data.reward_action : null;
          data.reward_sparks = reward ? Number(data.reward_sparks) : 0;
        }
        return data;
      };
      const input = () => {
        const data = values();
        const starts = new Date(data.starts_at),
          ends = new Date(data.ends_at);
        if (
          !Number.isFinite(starts.getTime()) ||
          !Number.isFinite(ends.getTime()) ||
          ends <= starts
        )
          throw Error('End must be after start.');
        if (localDate(starts) !== data.starts_at || localDate(ends) !== data.ends_at)
          throw Error(
            'That local time does not exist because of a clock change. Choose another time.',
          );
        if (Boolean(data.cta_label.trim()) !== Boolean(data.cta_url))
          throw Error('Choose both an action label and destination, or leave both empty.');
        if (data.reward_action && data.cta_url !== '/(app)/suggest-challenge')
          throw Error(
            'A submission reward needs the Suggest a Doji destination. Shop announcements can use No reward.',
          );
        return {
          ...data,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          priority: Number(data.priority),
          max_impressions_per_user: Number(data.max_impressions_per_user),
          min_hours_between_impressions: Number(data.min_hours_between_impressions),
        };
      };
      dialog.querySelector<HTMLButtonElement>('[data-editorial-action="preview"]')!.onclick =
        () => {
          const data = values();
          dialog.querySelector<HTMLElement>('#editorialPreviewSlot')!.innerHTML = preview(data);
        };
      form.onsubmit = (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        try {
          const data = input();
          const { reason, ...payload } = data;
          confirm(
            {
              kind: 'announcements',
              action: item ? 'save' : 'create',
              id: item?.id || null,
              version: item?.version || null,
              input: payload,
              reason: reason.trim(),
            },
            data,
            () => edit(item, data),
          );
        } catch (error) {
          feedback(failureMessage(error), true);
        }
      };
    }
    function confirm(command: EditorialCommand, item: EditorialContent, back: () => void) {
      if (!canWrite() || pending) return;
      const action = command.action;
      const effect = {
        create: 'Save an unpublished draft. Members will not see it.',
        save: 'Update this unpublished draft. Members will not see it.',
        publish:
          'Enable this announcement for eligible member claims during its window. This does not send a push or force an immediate popup.',
        cancel:
          'Stop future claims. A popup already claimed by a member cannot be recalled. Existing receipts are preserved.',
        approved:
          'Accept this idea into the challenge pool, reusing its original challenge if previously accepted. No Doji will be scheduled. Existing rewards cannot be earned again by reversing decisions.',
        rejected:
          'Decline this idea and remove any linked challenge from future selection. Past participation and earned Sparks stay intact. Existing review-notification rules apply.',
        pending:
          'Return this idea to Pending review and remove any linked challenge from future selection until accepted again. Past participation and earned Sparks stay intact. Reopening does not send a push notification.',
      }[action];
      intent = { ...command, idempotencyKey: crypto.randomUUID() };
      shell(
        'Confirm action',
        `<p class="editorialConsequence">${escape(effect)}</p>${command.kind === 'announcements' ? preview(item) : ideaPreview(item)}
        ${command.kind === 'announcements' ? `<p><strong>Window:</strong> ${escape(date(item.starts_at))} — ${escape(date(item.ends_at))}</p><p><strong>Display:</strong> ${escape(item.max_impressions_per_user)} impression(s) per account · ${escape(item.min_hours_between_impressions)} hours apart · priority ${escape(item.priority)}</p>` : ''}
        <p><strong>${command.kind === 'suggestions' ? 'Member-visible rationale' : 'Audit rationale'}</strong><br>${escape(command.reason)}</p><div class="editorialActions">${button('back', 'Back')}${button('confirm', 'Confirm action', true)}</div>`,
        'modal',
      );
      dialog.querySelector<HTMLButtonElement>('[data-editorial-action="back"]')!.onclick = () => {
        intent = null;
        back();
      };
      dialog.querySelector<HTMLButtonElement>('[data-editorial-action="confirm"]')!.onclick =
        submit;
      dialog.querySelector<HTMLButtonElement>('[data-editorial-action="back"]')!.focus();
    }
    async function submit() {
      if (pending || !intent || !canWrite()) return;
      const command = intent;
      const stamp = epoch();
      const revision = detailRevision;
      pending = true;
      dialog.querySelectorAll('button').forEach((el) => {
        el.disabled = true;
      });
      feedback('Saving…');
      try {
        const result = await client.editorialCommand(command);
        if (!valid(stamp) || revision !== detailRevision) return;
        pending = false;
        intent = null;
        if (result.item_unavailable === true && result.outcome === 'saved') {
          active = null;
          shell(
            'Action already recorded',
            '<p>The original command succeeded. This record is no longer available; it was not submitted again.</p>',
          );
          feedback('Saved outcome verified from the command receipt.');
          void load(command.kind, 0);
          onSaved();
          return;
        }
        active = { kind: command.kind, id: result.id, item: result };
        // Committed command is decisive even if the subsequent read fails.
        showDetail({ ...result, can_write: true }, 'Saved successfully.');
        void load(command.kind, 0);
        onSaved();
      } catch (error) {
        if (!valid(stamp) || revision !== detailRevision) return;
        pending = false;
        feedback(
          `Could not confirm the outcome. ${failureMessage(error) || 'Connection interrupted.'} Retry this same action safely, or close and reload the record before deciding again.`,
          true,
        );
        // Keep immutable payload/key for an ambiguous retry. Editing uses a new
        // intent only after returning to the authoritative record.
        dialog.querySelectorAll('button').forEach((el) => {
          el.disabled = false;
        });
        dialog.querySelector<HTMLButtonElement>('[data-editorial-action="back"]')!.disabled = true;
        dialog.querySelector<HTMLButtonElement>('[data-editorial-action="confirm"]')!.textContent =
          'Retry same action';
      }
    }
    function clear() {
      pending = false;
      close(true);
      for (const [kind, p] of pages) {
        ++p.revision;
        p.items = [];
        p.cursors = [null];
        p.filter = 'all';
        p.index = 0;
        p.next = null;
        p.loaded = false;
        p.loading = false;
        p.write = false;
        render(kind);
      }
    }
    document.addEventListener('portal:view', (event) => {
      if (pages.has(event.detail) && canRead()) void load(event.detail, 0);
    });
    return Object.freeze({
      open,
      clear,
      reconcile: () => {
        if (!canRead()) {
          clear();
          return;
        }
        // Do not overwrite drafts/confirmations when realtime arrives. Server
        // version comparison rejects stale decisions; users reload deliberately.
        if (pages.has(visible())) void load(visible(), 0);
      },
    });
  }
  window.DojiAdminEditorial = Object.freeze({ create });
})();
