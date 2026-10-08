import type { ApplicationRecord } from '../application-client.mts';
export interface JourneyState {
  heading: string;
  title: string;
  description: string;
  next: string;
  step: number;
  details: string;
  review: string;
}
const states: Record<string, JourneyState> = {
  new: {
    heading: 'Your account is ready.',
    title: 'Introduce your business',
    description:
      'Start your application below. Your progress is saved only when you choose Save draft.',
    next: 'Add your business details, check your answers, then submit them for review.',
    step: 2,
    details: 'Not started',
    review: 'Not submitted',
  },
  draft: {
    heading: 'Let’s finish your application.',
    title: 'Your draft is saved',
    description:
      'You can continue where you left off. Your application has not been sent for review.',
    next: 'Complete your details and review your application before submitting.',
    step: 2,
    details: 'In progress',
    review: 'Not submitted',
  },
  pending: {
    heading: 'Your application is with us.',
    title: 'Application received',
    description:
      'Your application has been submitted to Doji for review. You do not need to submit it again.',
    next: 'No action is needed right now. Return here to check for a decision or a request for changes. Contact us if you have a question while you wait.',
    step: 3,
    details: 'Submitted',
    review: 'Pending review',
  },
  changes_requested: {
    heading: 'A few details need your attention.',
    title: 'Changes requested',
    description:
      'Read the note from Doji, update your details below, and submit the revised application.',
    next: 'Address the reviewer’s note, check your updated answers and submit again. Your previous submission remains in the application history.',
    step: 2,
    details: 'Changes needed',
    review: 'Waiting for your update',
  },
  approved: {
    heading: 'Welcome to Doji for Business.',
    title: 'Your business is approved',
    description:
      'Your application has been approved. You can now verify access to your secured business workspace.',
    next: 'Open your workspace using your authenticator. Campaign publishing and billing are not open yet; contact Doji to discuss next steps.',
    step: 3,
    details: 'Complete',
    review: 'Approved',
  },
  declined: {
    heading: 'Your application has been reviewed.',
    title: 'Application not approved',
    description:
      'Doji has not approved this application. Review the decision below for any information provided.',
    next: 'Contact Doji if you need help understanding the decision. Include your application reference so we can find the right record.',
    step: 3,
    details: 'Submitted',
    review: 'Not approved',
  },
};
const unknown: JourneyState = {
  heading: 'Your business',
  title: 'Status unavailable',
  description: 'We could not confirm your application status. Refresh to check again.',
  next: 'Refresh the page status, or contact support if it stays unavailable. Do not submit another application.',
  step: 0,
  details: 'Status unavailable',
  review: 'Status unavailable',
};
export function journeyState(application: ApplicationRecord | null | undefined) {
  const state = application?.state || '';
  return application ? (Object.hasOwn(states, state) ? states[state]! : unknown) : states.new!;
}
export function displayTime(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
export function applicationEvidence(application: ApplicationRecord | null | undefined) {
  const value = (application || {}) as Record<string, unknown>;
  const reference =
    typeof value.id === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.id)
      ? value.id
      : '';
  const history = Array.isArray(value.history) ? value.history.slice(0, 30) : [];
  const labels: Record<string, string> = {
    save: 'Draft saved',
    submit: 'Application submitted',
    approve: 'Application approved',
    approved: 'Application approved',
    request_changes: 'Changes requested',
    changes_requested: 'Changes requested',
    decline: 'Application not approved',
    declined: 'Application not approved',
  };
  return {
    reference,
    submitted: displayTime(value.submitted_at),
    updated: displayTime(value.updated_at),
    more: value.history_has_more === true,
    history: history.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      if (typeof entry.action !== 'string') return [];
      const time = displayTime(entry.occurred_at);
      if (!time) return [];
      return [
        {
          title: Object.hasOwn(labels, entry.action)
            ? labels[entry.action]!
            : 'Application updated',
          time,
          response: typeof entry.response === 'string' ? entry.response.slice(0, 4000) : '',
        },
      ];
    }),
  };
}
