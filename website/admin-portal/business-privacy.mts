import {
  applicationForm,
  applicationFields,
  businessStateLabel,
} from '../business-portal/application-form.mts';
import type {
  PrivacyHistory,
  PrivacyCase,
  PrivacyCorrection,
  PrivacyOptions,
  PrivacyIntent,
  PrivacyRequest,
  PrivacyClient,
} from './privacy-contracts.d.mts';
type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
function errorStatus(error: unknown) {
  return error !== null && typeof error === 'object' && 'status' in error
    ? error.status
    : undefined;
}
function errorMessage(error: unknown) {
  return error !== null && typeof error === 'object' && 'message' in error
    ? error.message
    : undefined;
}
const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => entities[c]!);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || '');
const states: Readonly<Record<string, string>> = {
  open: 'Open',
  prepared: 'Erasure prepared',
  executing: 'Erasure in progress',
  primary_erased: 'Primary data erased — review remaining copies',
  completed: 'Completed',
  denied: 'Denied',
};
const kinds: Readonly<Record<string, string>> = {
  access: 'Access to information',
  correction: 'Correct information',
  closure: 'Close business access',
  erasure: 'Erase business information',
};
const actions: Readonly<Record<string, readonly [string, string]>> = {
  correct_draft: [
    'Save corrected draft',
    'Updates only the current application draft at the reviewed revision. Submitted snapshots and agreements remain unchanged. The applicant must submit the corrected draft through the normal review flow. This does not change Auth contact details or MFA.',
  ],
  hold: [
    'Place retention hold',
    'Prevents starting erasure for this business. It does not restore already erased data.',
  ],
  release_hold: [
    'Release retention hold',
    'Removes the hold owned by this case. Verify the retention basis has ended.',
  ],
  close_account: [
    'Close business access',
    'Disables this business account and suspends its organization. This does not erase information.',
  ],
  prepare_erasure: [
    'Prepare erasure',
    'Disables business access and prepares this exact case for separately authorized execution. This button does not delete Auth data.',
  ],
  complete: [
    'Complete request',
    'Records that the assessed request was fulfilled and the requester accurately informed. It does not send a response or delete additional copies.',
  ],
  deny: [
    'Deny request',
    'Records a reviewed denial. Reference the assessment and the response supplied to the requester.',
  ],
};
const date = (value: string | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';
const field = (id: string, label: string, value: unknown) =>
  `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" readonly value="${esc(value)}"></div>`;
const button = (id: string, label: string, primary = false) =>
  `<button type="button" class="portalButton${primary ? ' primary' : ''}" id="${id}">${label}</button>`;
const checkedCase = (item: PrivacyCase, id?: string) => {
  if (
    !item ||
    !uuid(item.id) ||
    (id && item.id !== id) ||
    !uuid(item.account_id) ||
    !Object.hasOwn(kinds, item.kind) ||
    !Object.hasOwn(states, item.state) ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 1 ||
    !Number.isFinite(Date.parse(item.due_at))
  )
    throw Error('invalid');
  return item;
};
const checkedHistory = (rows: PrivacyHistory[], after: number, max: number, revision?: number) => {
  if (!Array.isArray(rows) || rows.length > max) throw Error('invalid');
  let last = after;
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row.revision) ||
      row.revision <= last ||
      (revision && row.revision > revision)
    )
      throw Error('invalid');
    last = row.revision;
  }
  return last;
};

export function createBusinessPrivacy({ root, client, session, epoch }: PrivacyOptions) {
  const allowed = () =>
    session()?.capabilities?.operator_manage === true &&
    session()?.capabilities?.legal_read === true;
  let generation = 0,
    queueGeneration = 0,
    pending = false,
    stale = false,
    record: PrivacyCase | null = null,
    trigger: Element | null = null;
  let filter = 'open',
    cursor: PrivacyCase | null = null,
    next: PrivacyCase | null = null,
    active = false,
    loading = false,
    loadAgain = false,
    reconciling = false,
    reconcileAgain = false;
  let historyAfter = 0,
    accessAfter = 0,
    intent: PrivacyIntent | null = null;
  let correction: PrivacyCorrection | null = null;
  let correctionRecorded = false;
  const receipts = new Map<string, string>();
  const dialog = document.createElement('dialog');
  dialog.className =
    'portalModal editorialDialog portalDrawer adminDrawer businessReviewDialog businessPrivacyDialog open';
  dialog.setAttribute('aria-labelledby', 'privacyTitle');
  document.body.append(dialog);
  const current = (stamp: number, auth: number) =>
    stamp === generation && auth === epoch() && allowed();
  const status = (message: string) => {
    const node = dialog.querySelector<HTMLElement>('#privacyStatus')!;
    if (node) node.textContent = message;
  };
  const enhance = (node: HTMLElement) =>
    node.querySelectorAll('select').forEach((select) => {
      window.DojiPortalSelect.enhance(select, true);
      window.DojiPortalSelect.refresh(select);
    });
  function close(force = false) {
    if (pending && !force) return;
    generation++;
    record = intent = correction = null;
    correctionRecorded = false;
    stale = pending = reconciling = reconcileAgain = false;
    dialog.close();
    dialog.replaceChildren();
    if (!force && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    trigger = null;
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  function shell(title: string, html: string, opener: Element | null | undefined) {
    close();
    trigger = opener || document.activeElement;
    dialog.innerHTML = `<header class="drawerHeader"><h2 id="privacyTitle" tabindex="-1">${esc(title)}</h2><button type="button" class="drawerCloseButton" data-close>Close</button></header><div class="editorialDrawerContent">${html}<p id="privacyStatus" role="status" aria-live="polite"></p></div>`;
    dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => close();
    dialog.showModal();
    dialog.querySelector('h2')!.focus();
    enhance(dialog);
  }
  function busy(value: boolean) {
    pending = value;
    dialog.querySelectorAll<FormControl>('button,input,select,textarea').forEach((node) => {
      node.disabled = value;
    });
    if (!value) syncCorrectionFields();
    enhance(dialog);
    if (!value && stale)
      dialog.querySelectorAll<HTMLButtonElement>('[data-decision]').forEach((node) => {
        node.disabled = true;
      });
  }
  function changed(
    message = 'This case changed. Your entries are preserved. Close and reopen before deciding.',
  ) {
    stale = true;
    intent = null;
    status(message);
    dialog.querySelector<HTMLElement>('#privacyAccess')!?.replaceChildren();
    correction = null;
    dialog
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('#privacyDraft [name]')
      .forEach((node) => {
        node.disabled = true;
      });
    const confirmation = dialog.querySelector<HTMLElement>('#privacyConfirmation')!;
    if (confirmation) confirmation.hidden = true;
    dialog.querySelectorAll<HTMLButtonElement>('[data-decision]').forEach((node) => {
      node.disabled = true;
    });
  }
  function requestKey(body: PrivacyRequest) {
    const fingerprint = JSON.stringify(body);
    if (!receipts.has(fingerprint)) {
      if (receipts.size >= 50) throw Error('receipt-limit');
      receipts.set(fingerprint, crypto.randomUUID());
    }
    return receipts.get(fingerprint)!;
  }
  function confirmation(
    form: HTMLFormElement,
    makeIntent: () => PrivacyIntent | null,
    apply: PrivacyClient['businessPrivacyCommand'],
  ) {
    const panel = document.createElement('section');
    panel.id = 'privacyConfirmation';
    panel.hidden = true;
    panel.innerHTML = `<h3>Confirm change</h3><p data-summary></p><div class="editorialActions">${button('privacyBack', 'Back')}${button('privacyApply', 'Confirm', true)}</div>`;
    form.append(panel);
    const reset = () => {
      intent = null;
      panel.hidden = true;
      form
        .querySelectorAll<HTMLInputElement>('[data-private-reference]')
        .forEach((node) => node.setCustomValidity(''));
    };
    form.addEventListener('input', reset);
    form.addEventListener('change', reset);
    panel.querySelector<HTMLButtonElement>('#privacyBack')!.onclick = reset;
    form.onsubmit = (event) => {
      event.preventDefault();
      form
        .querySelectorAll<HTMLInputElement>('[data-private-reference]')
        .forEach((node) =>
          node.setCustomValidity(
            /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/.test(node.value.trim())
              ? ''
              : 'Use an opaque reference of 8–128 letters, numbers, periods, underscores, colons, slashes or hyphens.',
          ),
        );
      if (pending || stale || !allowed() || !form.reportValidity()) return;
      intent = makeIntent();
      if (!intent) return;
      panel.querySelector<HTMLElement>('[data-summary]')!.textContent = intent.summary;
      panel.hidden = false;
      panel.querySelector<HTMLButtonElement>('#privacyApply')!.focus();
    };
    panel.querySelector<HTMLButtonElement>('#privacyApply')!.onclick = async () => {
      if (!intent || pending || stale || !allowed()) return;
      const submitted = intent,
        stamp = generation,
        auth = epoch();
      busy(true);
      status('Saving change…');
      try {
        const result = await apply({ ...submitted.body, p_request_id: requestKey(submitted.body) });
        if (!current(stamp, auth)) return;
        if (
          !uuid(result?.id) ||
          !states[result.state] ||
          !Number.isSafeInteger(result.revision) ||
          (record
            ? result.id !== record.id || result.revision !== record.revision + 1
            : result.revision !== 1 || result.state !== 'open')
        )
          throw Error('invalid');
        // Never replay a committed command merely because its follow-up read failed.
        pending = false;
        const nextGeneration = generation + 1;
        await open(result.id, trigger);
        if (dialog.open && generation === nextGeneration && auth === epoch() && allowed())
          status(
            record?.id === result.id
              ? 'Change saved. Current case loaded.'
              : 'Change saved, but the current case could not be reloaded. Close and reopen to verify; do not submit it again.',
          );
      } catch (error) {
        if (!current(stamp, auth)) return;
        if (errorStatus(error) === 409) changed();
        else if (errorStatus(error) === 401 || errorStatus(error) === 403) {
          close(true);
          root.replaceChildren();
          root.hidden = true;
        } else
          status(
            errorMessage(error) === 'receipt-limit'
              ? 'The session retry ledger is full. Reconcile outstanding requests before signing in again.'
              : 'The change could not be confirmed. Do not assume it failed. Retry this unchanged confirmation to use the same request reference, or review the current case first.',
          );
      } finally {
        if (current(stamp, auth)) {
          busy(false);
          if (stale) changed();
        }
      }
    };
  }
  const referenceField = (id: string, label: string) =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" required minlength="8" maxlength="128" data-private-reference autocomplete="off"><small>Opaque protected-record reference only. No names, email addresses, passwords or evidence contents.</small></div>`;
  function newCase(opener: Element | null) {
    if (!allowed() || pending) return;
    shell(
      'Record privacy request',
      `<p>Verify the requester’s identity, business authority and scope through the protected support process first. This form does not send an email.</p><form id="privacyForm"><div class="field"><label for="privacyAccount">Verified business account ID</label><input id="privacyAccount" required maxlength="36" autocomplete="off"><small>Exact business UUID from the verified record; never a member account or a guessed match.</small></div><div class="field"><label for="privacyKind">Request type</label><select id="privacyKind" required><option value="">Choose a type</option>${Object.entries(
        kinds,
      )
        .map(([key, label]) => `<option value="${key}">${label}</option>`)
        .join(
          '',
        )}</select></div>${referenceField('privacyVerification', 'Identity and authority verification reference')}<div class="field"><label for="privacyDue">Assessed response deadline (your local time)</label><input id="privacyDue" type="datetime-local" required><small>Assess from the original support request receipt, not the time this case is recorded. No automatic legal deadline is inferred.</small></div><label class="consentRow"><input id="privacyVerified" type="checkbox" required><span>I verified the exact business account, authority, request scope and assessed deadline.</span></label><div class="editorialActions"><button class="portalButton primary" type="submit">Review request</button></div></form>`,
      opener,
    );
    confirmation(
      dialog.querySelector('form')!,
      () => {
        const account = dialog.querySelector<HTMLInputElement>('#privacyAccount')!.value.trim(),
          due = dialog.querySelector<HTMLInputElement>('#privacyDue')!.value;
        if (!uuid(account) || !Number.isFinite(Date.parse(due))) {
          status('Enter the exact verified business UUID and a valid deadline.');
          return null;
        }
        const body = {
          p_account_id: account,
          p_kind: dialog.querySelector<HTMLSelectElement>('#privacyKind')!.value,
          p_verification_reference: dialog
            .querySelector<HTMLInputElement>('#privacyVerification')!
            .value.trim(),
          p_due_at: new Date(due).toISOString(),
        };
        return {
          body,
          summary: `Record ${kinds[body.p_kind]} for business ${account}. Assessed deadline: ${date(body.p_due_at)}. No account change is made by recording this request.`,
        };
      },
      (input) => client.businessPrivacyOpen(input),
    );
  }
  function historyMarkup(rows: PrivacyHistory[]) {
    return (
      rows
        .map(
          (row) =>
            `<article class="editorialPreview"><strong>${esc(actions[row.action]?.[0] || row.action.replaceAll('_', ' '))}</strong><p>${esc(date(row.occurred_at))} · Revision ${row.revision}</p><p>Evidence reference: ${esc(row.evidence_reference)}</p></article>`,
        )
        .join('') || '<p>No entries in this page.</p>'
    );
  }
  async function open(id: string, opener: Element | null) {
    if (!allowed() || pending || !uuid(id)) return;
    shell('Privacy request', '<p>Loading verified case…</p>', opener);
    const stamp = generation,
      auth = epoch();
    try {
      const item = checkedCase(
        await client.businessPrivacyCase({ p_case_id: id, p_after_revision: 0 }),
        id,
      );
      if (!current(stamp, auth)) return;
      historyAfter = checkedHistory(item.history, 0, 30, item.revision);
      if (typeof item.history_has_more !== 'boolean' || (item.history_has_more && !historyAfter))
        throw Error('invalid');
      showCase(item);
    } catch {
      if (current(stamp, auth)) {
        dialog.querySelector<HTMLElement>('.editorialDrawerContent')!.innerHTML =
          '<p id="privacyStatus" role="status">The exact case could not be verified. Close and reopen to retry. No decision is available.</p>';
      }
    }
  }
  function showCase(item: PrivacyCase) {
    record = item;
    stale = false;
    const held = Boolean(item.hold?.reference);
    const choices: string[] = [];
    if (
      !['executing', 'primary_erased'].includes(item.state) &&
      !(item.kind === 'erasure' && item.state === 'completed')
    ) {
      if (!held) choices.push('hold');
      else if (item.hold!.case_id === item.id) choices.push('release_hold');
    }
    if (item.state === 'open') {
      if (item.kind === 'closure') choices.push('close_account');
      if (item.kind === 'erasure' && !held) choices.push('prepare_erasure');
      if (['access', 'closure'].includes(item.kind)) choices.push('complete');
      correctionRecorded =
        item.kind === 'correction' && item.history.some((row) => row.action === 'correct_draft');
      if (correctionRecorded) choices.push('complete');
      choices.push('deny');
    }
    if (item.kind === 'erasure' && item.state === 'primary_erased') choices.push('complete');
    dialog.querySelector<HTMLElement>('.editorialDrawerContent')!.innerHTML =
      `<p class="eyebrow">${esc(kinds[item.kind])} · ${esc(states[item.state])}</p><div class="formGrid">${field('privacyCaseId', 'Case ID', item.id)}${field('privacyBusinessId', 'Business account ID', item.account_id)}${field('privacyRevision', 'Case revision', item.revision)}${field('privacyRecorded', 'Recorded in workflow', date(item.received_at))}${field('privacyDeadline', 'Assessed response deadline', date(item.due_at))}${field('privacyEvidence', 'Verification reference', item.verification_reference)}</div><p>The deadline is assessed from the original support receipt. “Recorded in workflow” is not the original request receipt time.</p><section class="editorialPreview"><h3>Retention hold</h3><p>${held ? `Active · ${esc(item.hold!.reference)} · Owner case ${esc(item.hold!.case_id)}` : 'No active hold returned for this business.'}</p>${held && item.hold!.case_id !== item.id && uuid(item.hold!.case_id) ? button('privacyHoldCase', 'Open hold-owning case') : ''}<p>Commands recheck account-wide holds and execution state. A different case may prevent a change.</p></section>${item.kind === 'correction' ? '<p class="editorialPreview">Corrections apply only to the current application draft, not historical submissions. Auth contact changes and lost-MFA recovery require separately verified handling. Saving a draft does not complete the request or send a response.</p>' : ''}${item.kind === 'correction' && item.state === 'open' ? `<div class="editorialActions">${button('privacyReadCorrection', 'Review current draft')}</div><section id="privacyDraft" aria-label="Current business draft"></section>` : ''}${item.kind === 'erasure' ? '<p class="editorialPreview">Preparation is not deletion. Execution uses a separate authorized service procedure; there is no delete button here. Primary erasure is not final completion: review provider logs, backups, support copies and retained evidence before responding.</p>' : ''}${item.kind === 'access' && item.state === 'open' ? `<div class="editorialActions">${button('privacyReadAccess', 'Review application information')}</div><section id="privacyAccess" aria-label="Business application information"></section>` : ''}${choices.length ? `<form id="privacyForm"><div class="field"><label for="privacyAction">Action</label><select id="privacyAction" required><option value="">Choose an action</option>${choices.map((key) => `<option value="${key}">${actions[key]![0]}</option>`).join('')}</select></div><p id="privacyActionHelp"></p>${referenceField('privacyActionReference', 'Assessment / fulfillment reference')}<label class="consentRow"><input id="privacyAcknowledged" type="checkbox" required><span>I reviewed this exact business and action. For completion or denial, the referenced evidence records the assessment and accurate response already supplied to the requester.</span></label><div class="editorialActions"><button class="portalButton primary" type="submit" data-decision>Review change</button></div></form>` : ''}<p id="privacyStatus" role="status" aria-live="polite"></p><h3>Case history · oldest first</h3><div id="privacyHistory">${historyMarkup(item.history)}</div><div class="editorialActions">${item.history_has_more ? button('privacyMoreHistory', 'Next 30 history entries') : ''}</div>`;
    enhance(dialog);
    dialog
      .querySelector('#privacyHoldCase')
      ?.addEventListener('click', () => void open(item.hold!.case_id, trigger));
    dialog
      .querySelector<HTMLElement>('#privacyReadAccess')!
      ?.addEventListener('click', () => void readAccess(0));
    dialog
      .querySelector('#privacyReadCorrection')
      ?.addEventListener('click', () => void readCorrection());
    dialog
      .querySelector('#privacyMoreHistory')
      ?.addEventListener('click', () => void moreHistory());
    const form = dialog.querySelector('form');
    if (form) {
      dialog.querySelector<HTMLSelectElement>('#privacyAction')!.onchange = () => {
        dialog.querySelector<HTMLElement>('#privacyActionHelp')!.textContent =
          actions[dialog.querySelector<HTMLSelectElement>('#privacyAction')!.value]?.[1] || '';
        syncCorrectionFields();
      };
      confirmation(
        form,
        () => {
          const action = dialog.querySelector<HTMLSelectElement>('#privacyAction')!.value;
          if (
            !choices.includes(action) &&
            !(action === 'correct_draft' && correction) &&
            !(action === 'complete' && correctionRecorded && item.state === 'open')
          )
            return null;
          const correctionBody: PrivacyRequest = {};
          if (action === 'correct_draft') {
            if (!correction || correction.case_revision !== item.revision) return null;
            const details: Record<string, string> = { ...correction.application.details };
            dialog
              .querySelectorAll<
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              >('#privacyDraft [name]')
              .forEach((node) => {
                details[node.name] = node.value.trim();
              });
            if (JSON.stringify(details) === JSON.stringify(correction.application.details)) {
              status('No draft fields changed.');
              return null;
            }
            correctionBody.p_details = details;
            correctionBody.p_application_revision = correction.application.revision;
          }
          return {
            body: {
              p_case_id: item.id,
              p_revision: item.revision,
              p_action: action,
              p_reference: dialog
                .querySelector<HTMLInputElement>('#privacyActionReference')!
                .value.trim(),
              ...correctionBody,
            },
            summary: `${actions[action]![0]} · Business ${item.account_id} · Case ${item.id} · Revision ${item.revision}.${action === 'correct_draft' ? ` Current draft revision ${correction!.application.revision}.` : ''} ${actions[action]![1]}`,
          };
        },
        (input) => client.businessPrivacyCommand(input),
      );
    }
  }
  function syncCorrectionFields() {
    const enabled =
      !pending &&
      !stale &&
      correction &&
      dialog.querySelector<HTMLSelectElement>('#privacyAction')!?.value === 'correct_draft';
    dialog
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('#privacyDraft [name]')
      .forEach((node) => {
        node.disabled = !enabled;
      });
    enhance(dialog.querySelector<HTMLElement>('#privacyDraft')! || document.createElement('div'));
  }
  async function readCorrection() {
    if (pending || stale || !record || !allowed() || correction) return;
    const stamp = generation,
      auth = epoch(),
      item = record;
    busy(true);
    try {
      const data = await client.businessPrivacyCorrection({ p_case_id: item.id });
      if (!current(stamp, auth)) return;
      if (
        data?.case_id !== item.id ||
        data.account_id !== item.account_id ||
        data.case_revision !== item.revision ||
        typeof data.correction_allowed !== 'boolean'
      )
        throw Error('invalid');
      const target = dialog.querySelector<HTMLElement>('#privacyDraft')!;
      if (!data.correction_allowed) {
        const reasons: Readonly<Record<string, string>> = {
          no_application: 'No application draft exists for this business.',
          review_required:
            'The application is not editable. Use business review to request changes or reopen it first.',
          erasure_prepared:
            'Erasure is already prepared for this business. Draft correction is blocked.',
        };
        if (data.blocked_reason === null || !Object.hasOwn(reasons, data.blocked_reason))
          throw Error('invalid');
        target.innerHTML = `<p class="editorialPreview">${reasons[data.blocked_reason]}</p>`;
        return;
      }
      const app = data.application;
      if (
        !uuid(app?.id) ||
        !Number.isSafeInteger(app.revision) ||
        app.revision < 1 ||
        !['draft', 'changes_requested'].includes(app.state) ||
        !app.details ||
        Array.isArray(app.details) ||
        typeof app.details !== 'object' ||
        data.blocked_reason !== null
      )
        throw Error('invalid');
      if (
        Object.entries(app.details).some(
          ([key, value]) =>
            !applicationFields.some(([field]) => field === key) ||
            typeof value !== 'string' ||
            value.length > 1000,
        )
      )
        throw Error('invalid');
      correction = data;
      target.innerHTML = `<h3>Current editable draft</h3><p>Application ${esc(app.id)} · Revision ${app.revision}. Select “Save corrected draft” below to edit. Optional empty fields remain a draft; normal submission rules still apply.</p>${applicationForm(app.details, false, 'privacyCorrection')}${app.details.business_address ? field('privacyPriorAddress', 'Previously recorded address (retained unchanged)', app.details.business_address) : ''}`;
      target
        .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[name]')
        .forEach((node) => {
          node.required = false;
          node.setAttribute('form', 'privacyForm');
          const edit = () => {
            intent = null;
            dialog.querySelector<HTMLElement>('#privacyConfirmation')!.hidden = true;
          };
          node.addEventListener('input', edit);
          node.addEventListener('change', edit);
        });
      const select = dialog.querySelector<HTMLSelectElement>('#privacyAction')!;
      const option = document.createElement('option');
      option.value = 'correct_draft';
      option.textContent = actions.correct_draft![0];
      select.append(option);
      enhance(dialog);
      syncCorrectionFields();
      status(
        'Current draft loaded. Submitted snapshots and any prior address are retained unchanged.',
      );
    } catch {
      if (current(stamp, auth)) {
        correction = null;
        dialog.querySelector<HTMLElement>('#privacyDraft')!.replaceChildren();
        status(
          'The current draft could not be verified. No correction is available. Close and reopen or retry the read.',
        );
      }
    } finally {
      if (current(stamp, auth)) busy(false);
    }
  }
  async function moreHistory() {
    if (pending || !record || !allowed()) return;
    const stamp = generation,
      auth = epoch(),
      item = record;
    busy(true);
    try {
      const page = checkedCase(
        await client.businessPrivacyCase({ p_case_id: item.id, p_after_revision: historyAfter }),
        item.id,
      );
      if (!current(stamp, auth)) return;
      if (page.revision !== item.revision || page.account_id !== item.account_id) {
        changed();
        return;
      }
      const after = checkedHistory(page.history, historyAfter, 30, item.revision);
      if (
        typeof page.history_has_more !== 'boolean' ||
        (page.history_has_more && after === historyAfter)
      )
        throw Error('invalid');
      historyAfter = after;
      if (
        item.kind === 'correction' &&
        item.state === 'open' &&
        page.history.some((row) => row.action === 'correct_draft')
      ) {
        correctionRecorded = true;
        const select = dialog.querySelector<HTMLSelectElement>('#privacyAction')!;
        if (select && !select.querySelector('option[value="complete"]')) {
          const option = document.createElement('option');
          option.value = 'complete';
          option.textContent = actions.complete![0];
          select.append(option);
        }
      }
      dialog.querySelector<HTMLElement>('#privacyHistory')!.innerHTML = historyMarkup(page.history);
      dialog.querySelector<HTMLElement>('#privacyMoreHistory')!.hidden = !page.history_has_more;
    } catch {
      if (current(stamp, auth)) status('History could not be verified. Retry this page.');
    } finally {
      if (current(stamp, auth)) busy(false);
    }
  }
  async function readAccess(after: number) {
    if (pending || stale || !record || !allowed()) return;
    const stamp = generation,
      auth = epoch(),
      item = record;
    busy(true);
    try {
      const data = await client.businessPrivacyAccess({
        p_case_id: item.id,
        p_after_revision: after,
      });
      if (!current(stamp, auth)) return;
      if (
        data?.case_id !== item.id ||
        data.account_id !== item.account_id ||
        !Array.isArray(data.submissions) ||
        data.submissions.length > 50 ||
        typeof data.history_has_more !== 'boolean'
      )
        throw Error('invalid');
      accessAfter = checkedHistory(data.history, after, 30);
      if (data.history_has_more && accessAfter === after) throw Error('invalid');
      const target = dialog.querySelector<HTMLElement>('#privacyAccess')!;
      target.innerHTML = `<h3>Application information · restricted review</h3><p>Not a full provider/support export. Review scope and third-party information before secure delivery. Nothing is automatically downloaded or sent.</p><div class="formGrid">${field('privacyName', 'Business account name', data.identity?.name || 'Not retained')}${field('privacyEmail', 'Business account email', data.identity?.email || 'Not retained')}${field('privacyTerms', 'Signup terms version', data.signup_agreement?.terms_version || 'No recorded agreement')}${field('privacyNotice', 'Signup privacy version', data.signup_agreement?.privacy_version || 'No recorded agreement')}${field('privacyAccepted', 'Signup agreement recorded', date(data.signup_agreement?.accepted_at))}</div><h3>Current application</h3>${data.application ? `<p>${esc(businessStateLabel(data.application.state))} · Revision ${esc(data.application.revision)}</p>${applicationForm(data.application.details, true, 'privacyApplication')}<p>Applicant response: ${esc(data.application.response)}</p>` : '<p>No application recorded.</p>'}<h3>Submitted snapshots</h3>${data.submissions.map((submission, index) => `<details><summary>Submission ${esc(submission.submission)}</summary>${applicationForm(submission.details, true, `privacySubmission${index}`)}<p>Terms ${esc(submission.terms_version)} · Privacy ${esc(submission.privacy_version)} · ${esc(date(submission.accepted_at))}</p></details>`).join('') || '<p>No submitted snapshots.</p>'}<h3>Application history · oldest first</h3>${data.history.map((row) => `<article class="editorialPreview"><strong>${esc(row.action)}</strong><p>Revision ${row.revision} · ${esc(date(row.occurred_at))}</p><p>${esc(row.response)}</p></article>`).join('') || '<p>No entries in this page.</p>'}${data.history_has_more ? `<div class="editorialActions">${button('privacyMoreAccess', 'Next 30 application history entries')}</div>` : ''}`;
      target
        .querySelector('#privacyMoreAccess')
        ?.addEventListener('click', () => void readAccess(accessAfter));
    } catch {
      if (current(stamp, auth)) {
        dialog.querySelector<HTMLElement>('#privacyAccess')!.replaceChildren();
        status(
          'Application information could not be verified. No information was sent. Retry the read.',
        );
      }
    } finally {
      if (current(stamp, auth)) busy(false);
    }
  }
  function entry() {
    root.hidden = !allowed();
    if (!allowed()) return;
    if (!root.childElementCount) {
      root.innerHTML = `<header class="panelHeader"><div><h3>Business privacy requests</h3><p>Restricted to authorized privacy operators. Requests are recorded after support verification; this does not publish a public intake.</p></div></header><div class="editorialActions">${button('privacyShow', 'Open privacy queue')}${button('privacyNew', 'Record request', true)}</div><div id="privacyQueue"></div>`;
      root.querySelector<HTMLButtonElement>('#privacyShow')!.onclick = () => {
        active = true;
        void load();
      };
      root.querySelector<HTMLButtonElement>('#privacyNew')!.onclick = () =>
        newCase(root.querySelector<HTMLButtonElement>('#privacyNew'));
    }
  }
  async function load() {
    if (!allowed() || !active) return;
    if (loading) {
      loadAgain = true;
      return;
    }
    loading = true;
    const stamp = ++queueGeneration,
      auth = epoch(),
      state = filter;
    const valid = () => stamp === queueGeneration && auth === epoch() && allowed();
    const target = root.querySelector<HTMLElement>('#privacyQueue')!;
    try {
      const rows = await client.businessPrivacyPage({
        p_state: state,
        p_after_due: cursor?.due_at ?? null,
        p_after_id: cursor?.id ?? null,
      });
      if (!valid()) return;
      if (!Array.isArray(rows) || rows.length > 25) throw Error('invalid');
      rows.forEach((row) => {
        checkedCase(row);
        if (row.state !== state) throw Error('invalid');
      });
      next = rows.length === 25 ? rows.at(-1)! : null;
      target.innerHTML = `<div class="editorialFilter"><label for="privacyState">Privacy request state</label><select id="privacyState">${Object.entries(
        states,
      )
        .map(
          ([key, label]) =>
            `<option value="${key}"${key === state ? ' selected' : ''}>${label}</option>`,
        )
        .join(
          '',
        )}</select>${button('privacyRefresh', 'Refresh privacy queue')}</div><p>${rows.length} ${rows.length === 1 ? 'record' : 'records'} on this page · earliest assessed deadline first</p><div class="businessAdminGrid">${rows.map((row) => `<button type="button" class="businessAdminCard" data-privacy-case="${esc(row.id)}"><span class="businessAvatar" aria-hidden="true">P</span><span class="businessCardBody"><strong>${esc(kinds[row.kind])}</strong><span>${esc(row.id)}</span><span>Due ${esc(date(row.due_at))}</span></span><span class="rowChevron" aria-hidden="true">›</span></button>`).join('') || '<p>No requests in this page.</p>'}</div><div class="editorialActions">${button('privacyFirst', 'First page')}${button('privacyNext', 'Next page')}</div><p role="status"></p>`;
      enhance(target);
      target.querySelector<HTMLSelectElement>('#privacyState')!.onchange = () => {
        filter = target.querySelector<HTMLSelectElement>('#privacyState')!.value;
        cursor = null;
        void load();
      };
      target.querySelector<HTMLButtonElement>('#privacyRefresh')!.onclick = () => void load();
      target.querySelector<HTMLButtonElement>('#privacyFirst')!.disabled = !cursor;
      target.querySelector<HTMLButtonElement>('#privacyFirst')!.onclick = () => {
        cursor = null;
        void load();
      };
      target.querySelector<HTMLButtonElement>('#privacyNext')!.disabled = !next;
      target.querySelector<HTMLButtonElement>('#privacyNext')!.onclick = () => {
        cursor = next;
        void load();
      };
      target.querySelectorAll<HTMLButtonElement>('[data-privacy-case]').forEach((node) => {
        node.onclick = () => void open(node.dataset.privacyCase!, node);
      });
    } catch {
      if (valid()) {
        target.innerHTML = `<p role="status">Privacy queue unavailable. No empty-queue or deadline assurance can be made.</p>${button('privacyRetry', 'Retry privacy queue')}`;
        target.querySelector('button')!.onclick = () => void load();
      }
    } finally {
      if (stamp === queueGeneration) {
        loading = false;
        if (loadAgain && valid()) {
          loadAgain = false;
          void load();
        }
      }
    }
  }
  return {
    isOpen: () => dialog.open,
    async reconcile() {
      if (!allowed()) {
        this.clear();
        return;
      }
      entry();
      if (pending) return;
      if (reconciling) {
        reconcileAgain = true;
        return;
      }
      if (!dialog.open || !record) {
        if (!dialog.open) void load();
        return;
      }
      reconciling = true;
      const stamp = generation,
        auth = epoch(),
        item = record;
      try {
        const fresh = checkedCase(
          await client.businessPrivacyCase({ p_case_id: item.id, p_after_revision: 0 }),
          item.id,
        );
        if (!current(stamp, auth)) return;
        if (
          fresh.revision !== item.revision ||
          fresh.account_id !== item.account_id ||
          JSON.stringify(fresh.hold) !== JSON.stringify(item.hold)
        )
          changed();
        if (!stale && correction) {
          const draft = await client.businessPrivacyCorrection({ p_case_id: item.id });
          if (!current(stamp, auth)) return;
          if (
            draft?.case_id !== item.id ||
            draft.account_id !== item.account_id ||
            draft.case_revision !== item.revision ||
            draft.correction_allowed !== true ||
            draft.application?.id !== correction.application.id ||
            draft.application?.revision !== correction.application.revision
          )
            changed(
              'The application draft changed or is no longer editable. Your entries are preserved. Close and reopen before saving.',
            );
        }
      } catch {
        if (current(stamp, auth))
          changed('Current case access could not be verified. Close and reopen before deciding.');
      } finally {
        if (current(stamp, auth)) {
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
      receipts.clear();
      active = loading = loadAgain = false;
      cursor = next = null;
      filter = 'open';
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
