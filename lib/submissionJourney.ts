import { newCommandId } from './idempotency';
import { diagnosticSessionIsCurrent, mobileDiagnosticSnapshot, recordSubmissionStep } from './mobileDiagnosticContext';

type Phase = 'upload' | 'submit' | 'receipt' | 'feed';
type Journey = {
  id: string; session: unknown; actor: string; occurrence: string; started: number;
  confirmed: boolean; rendered: boolean;
};
let current: Journey | undefined;
const failures = new WeakMap<object, { journey: Journey; phase: Phase; submission_confirmed: boolean }>();
const valid = (journey: Journey | undefined): journey is Journey => !!journey &&
  journey === current && diagnosticSessionIsCurrent(journey.session) && Date.now() - journey.started <= 900_000;

/** Actor/occurrence are compared in memory only; the diagnostic identifier is unrelated. */
export function beginSubmissionJourney(actor: string, occurrence: string): Journey {
  if (valid(current) && current.actor === actor && current.occurrence === occurrence) return current;
  return current = { id: newCommandId('diag'), session: mobileDiagnosticSnapshot().session_id,
    actor, occurrence, started: Date.now(), confirmed: false, rendered: false };
}

export function submissionStep(journey: Journey, phase: Phase, outcome: 'started' | 'confirmed' | 'failed', error?: unknown): void {
  if (!valid(journey)) return;
  if ((phase === 'submit' || phase === 'receipt') && outcome === 'confirmed') journey.confirmed = true;
  recordSubmissionStep(journey.id, phase, outcome, Date.now() - journey.started);
  if (error && typeof error === 'object') failures.set(error, {
    journey, phase, submission_confirmed: journey.confirmed,
  });
}

export function submissionFailureContext(error: unknown) {
  const value = error && typeof error === 'object' ? failures.get(error) : undefined;
  return value && valid(value.journey) ? { journey_id: value.journey.id, phase: value.phase,
    submission_confirmed: value.submission_confirmed } : undefined;
}

export function confirmedSubmission(actor: string | undefined, occurrence: string | undefined): boolean {
  return valid(current) && current.actor === actor && current.occurrence === occurrence && current.confirmed;
}

/** A rendered authorized feed (including an empty feed) is distinct from HTTP success. */
export function observeSubmissionFeed(actor: string | undefined, occurrence: string | undefined, outcome: 'failed' | 'rendered', error?: unknown): void {
  if (!confirmedSubmission(actor, occurrence) || !current || current.rendered) return;
  if (outcome === 'failed') submissionStep(current, 'feed', 'failed', error);
  else {
    recordSubmissionStep(current.id, 'feed', 'rendered', Date.now() - current.started);
    current.rendered = true;
  }
}
