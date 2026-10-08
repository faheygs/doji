import { applicationFields } from '../application-form.mts';
import type { ApplicationSnapshot } from '../application-client.mts';
import { control } from './config.mts';
import { applicationEvidence, journeyState } from './journey-model.mts';

function summary(details: Record<string, unknown>) {
  const list = document.createElement('dl');
  list.className = 'journeySummary';
  for (const [key, label] of applicationFields) {
    if (typeof details[key] !== 'string' || !details[key]) continue;
    const row = document.createElement('div'),
      term = document.createElement('dt'),
      value = document.createElement('dd');
    term.textContent = key === 'country' ? 'Country' : label;
    value.textContent = key === 'country' && details[key] === 'US' ? 'United States' : details[key];
    row.append(term, value);
    list.append(row);
  }
  return list;
}
export function createBusinessJourney() {
  let reviewing = false;
  const edit = () => {
    reviewing = false;
    control('applicationEditPanel').hidden = false;
    control('applicationReviewPanel').hidden = true;
    control('applicationReviewSummary').replaceChildren();
  };
  control('applicationEdit').addEventListener('click', () => {
    edit();
    control<HTMLInputElement>('businessTerms').checked = false;
    control('applicationFields').querySelector<HTMLInputElement>('input')?.focus();
  });
  control('applicationPrint').addEventListener('click', () => window.print());
  return {
    review(draft: Record<string, unknown>) {
      reviewing = true;
      control('applicationReviewSummary').replaceChildren(summary(draft));
      control('applicationEditPanel').hidden = true;
      control('applicationReviewPanel').hidden = false;
      control('applicationReviewTitle').focus();
    },
    isReviewing: () => reviewing,
    edited() {
      control('applicationSaveStatus').textContent = 'You have unsaved changes.';
    },
    completed(action: string) {
      if (action === 'save')
        control('applicationSaveStatus').textContent = 'Draft saved. You can safely return later.';
      else {
        edit();
        control('applicationStatusTitle').focus();
      }
    },
    render(state: ApplicationSnapshot, signedIn: boolean) {
      const loaded = signedIn && state.loaded;
      const model = journeyState(state.application),
        evidence = applicationEvidence(state.application);
      const status = state.application?.state;
      const editable =
        loaded && (!state.application || status === 'draft' || status === 'changes_requested');
      control('businessProgress').hidden = !loaded;
      control('businessStatusCard').hidden = !loaded;
      control('applicationEditor').hidden = !editable;
      control('applicationDetails').hidden = !loaded || editable;
      control('applicationHistory').hidden = !loaded || !evidence.history.length;
      control('businessHeading').textContent = loaded
        ? model.heading
        : state.readError
          ? 'Your status could not be loaded.'
          : 'Loading your business home…';
      control('businessIntro').textContent = loaded
        ? 'Your application, updates and next steps—all in one place.'
        : '';
      control('businessNextText').textContent = loaded
        ? model.next
        : state.readError
          ? 'Use Refresh status to try again, or contact support if this continues.'
          : 'We’re checking your application. Your details will appear when the check completes.';
      control('applicationStatusTitle').textContent = loaded ? model.title : '';
      control('applicationStatusDescription').textContent = loaded ? model.description : '';
      control('businessStatusCard').dataset.state = status || 'new';
      control('progressDetailsText').textContent = model.details;
      control('progressReviewText').textContent = model.review;
      ['progressAccount', 'progressDetails', 'progressReview'].forEach((id, index) => {
        const node = control(id);
        if (index + 1 === model.step) node.setAttribute('aria-current', 'step');
        else node.removeAttribute('aria-current');
      });
      control('applicationReference').textContent = loaded ? evidence.reference : '';
      control('applicationSubmitted').textContent = loaded ? evidence.submitted : '';
      control('applicationReceipt').hidden = !loaded || !evidence.reference;
      control('applicationSubmittedRow').hidden = !evidence.submitted;
      control('applicationReceiptActions').hidden =
        !loaded || !evidence.reference || !evidence.submitted;
      control('applicationResponsePanel').hidden = !loaded || !state.application?.response;
      control('applicationDetailsSummary').replaceChildren(
        ...(loaded && !editable ? [summary(state.application?.details || {})] : []),
      );
      control('applicationHistoryList').replaceChildren();
      if (loaded)
        for (const item of evidence.history) {
          const entry = document.createElement('li'),
            title = document.createElement('strong'),
            time = document.createElement('time');
          title.textContent = item.title;
          time.textContent = item.time;
          entry.append(title, time);
          if (item.response) {
            const response = document.createElement('p');
            response.textContent = item.response;
            entry.append(response);
          }
          control('applicationHistoryList').append(entry);
        }
      control('applicationHistoryMore').hidden = !evidence.more;
      if (!signedIn) {
        edit();
        control('applicationSaveStatus').textContent = '';
        control('applicationReference').textContent = control('applicationSubmitted').textContent =
          '';
        control('businessNextText').textContent = '';
      } else if (loaded && !editable) edit();
      if (state.stale) edit();
      control<HTMLButtonElement>('applicationReview').disabled =
        !editable || state.pending || state.stale;
      control<HTMLButtonElement>('applicationEdit').disabled = state.pending;
    },
  };
}
