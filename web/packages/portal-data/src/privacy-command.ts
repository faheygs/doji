import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { createBusinessOwnership } from './business-claim';
import { privacyStates, type PrivacyRecord, type PrivacyState } from './privacy-record';
import { validCorrectionDetails } from './privacy-data';

export const privacyActions = {
  correct_draft: [
    'Save corrected draft',
    'Updates only the current draft. Submitted snapshots, agreements and account credentials stay unchanged. The applicant must submit through normal review.',
  ],
  hold: [
    'Place retention hold',
    'Blocks starting erasure. It does not restore erased information.',
  ],
  release_hold: [
    'Release retention hold',
    'Releases the hold owned by this case. Verify that its retention basis has ended.',
  ],
  close_account: [
    'Close business access',
    'Disables this business account and suspends its organization. It does not erase information.',
  ],
  prepare_erasure: [
    'Prepare erasure',
    'Disables business access and prepares this case for separately authorized erasure. It does not execute deletion.',
  ],
  complete: [
    'Complete request',
    'Records fulfillment and your response to the requester. It does not send a response or delete remaining copies.',
  ],
  deny: [
    'Deny request',
    'Records the reviewed denial. Reference the assessment and the response already supplied to the requester.',
  ],
} as const;
export type PrivacyAction = keyof typeof privacyActions;
export type PrivacyInput = Readonly<{
  id: string;
  key: string;
  revision: number;
  ownerRevision: number;
  state: PrivacyState;
  action: PrivacyAction | 'claim' | 'release' | 'assign';
  target?: string;
  details?: Readonly<Record<string, string>>;
  applicationRevision?: number;
  reference: string;
}>;
export const privacyReference = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/.test(value);
export function privacyChoices(item: PrivacyRecord): PrivacyAction[] {
  const choices: PrivacyAction[] = [];
  if (
    !['executing', 'primary_erased'].includes(item.state) &&
    !(item.kind === 'erasure' && item.state === 'completed')
  ) {
    if (!item.hold) choices.push('hold');
    else if (item.hold.caseId === item.id) choices.push('release_hold');
  }
  if (item.state === 'open') {
    if (item.kind === 'closure') choices.push('close_account');
    if (item.kind === 'erasure' && !item.hold) choices.push('prepare_erasure');
    if (['access', 'closure'].includes(item.kind)) choices.push('complete');
    if (
      item.kind === 'correction' &&
      item.history.some((entry) => entry.action === 'correct_draft')
    )
      choices.push('complete');
    choices.push('deny');
  }
  if (item.kind === 'erasure' && item.state === 'primary_erased') choices.push('complete');
  return choices;
}
export function validPrivacyInput(input: PrivacyInput) {
  return (
    record(input) &&
    Object.keys(input).sort().join(',') ===
      (input.action === 'assign'
        ? 'action,id,key,ownerRevision,reference,revision,state,target'
        : input.action === 'correct_draft'
          ? 'action,applicationRevision,details,id,key,ownerRevision,reference,revision,state'
          : 'action,id,key,ownerRevision,reference,revision,state') &&
    (input.action !== 'correct_draft' ||
      (input.state === 'open' &&
        Number.isSafeInteger(input.applicationRevision) &&
        Number(input.applicationRevision) > 0 &&
        validCorrectionDetails(input.details))) &&
    (input.action !== 'assign' || uuid(input.target)) &&
    uuid(input.id) &&
    uuid(input.key) &&
    Number.isSafeInteger(input.revision) &&
    input.revision >= 1 &&
    input.revision < Number.MAX_SAFE_INTEGER &&
    Number.isSafeInteger(input.ownerRevision) &&
    input.ownerRevision >= 0 &&
    input.ownerRevision < Number.MAX_SAFE_INTEGER &&
    Object.hasOwn(privacyStates, input.state) &&
    (['claim', 'release', 'assign'].includes(input.action)
      ? input.reference === ''
      : Object.hasOwn(privacyActions, input.action) &&
        typeof input.reference === 'string' &&
        privacyReference(input.reference))
  );
}
export function createPrivacyCommand(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: PrivacyInput, signal: AbortSignal) => {
    input = freezePrivacyInput(input);
    if (!validPrivacyInput(input)) throw Error('Invalid privacy command.');
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state();
      if (
        !captured.session ||
        state.phase !== 'ready' ||
        state.session !== captured.session ||
        !state.operator?.capabilities.legal_read ||
        !state.operator.capabilities.operator_manage
      )
        throw Error('Privacy review permission required.');
      options.transport.assertSessionFresh();
    };
    if (!options.transport.hasSession()) {
      await options.signOut();
      throw Error('Employee session expired.');
    }
    current();
    const assignment = ['claim', 'release', 'assign'].includes(input.action);
    const result = await options.transport
      .request(assignment ? '/staff-workflow/command' : '/business-privacy/command', {
        method: 'POST',
        body: assignment
          ? {
              p_kind: 'business_privacy',
              p_id: input.id,
              p_revision: input.ownerRevision,
              p_source_version: String(input.revision),
              p_action: input.action,
              p_target: input.action === 'assign' ? input.target : null,
              p_request_id: input.key,
            }
          : {
              p_case_id: input.id,
              p_revision: input.revision,
              p_action: input.action,
              p_reference: input.reference,
              p_request_id: input.key,
              ...(input.action === 'correct_draft'
                ? { p_details: input.details, p_application_revision: input.applicationRevision }
                : {}),
            },
      })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    const expectedState =
      input.action === 'complete'
        ? 'completed'
        : input.action === 'deny'
          ? 'denied'
          : input.action === 'prepare_erasure'
            ? 'prepared'
            : input.state;
    if (
      !record(result) ||
      result.id !== input.id ||
      (assignment
        ? result.kind !== 'business_privacy' ||
          result.revision !== input.ownerRevision + 1 ||
          typeof result.replayed !== 'boolean' ||
          result.assigned_to !==
            (input.action === 'claim'
              ? captured.operator!.user_id
              : input.action === 'assign'
                ? input.target
                : null)
        : result.revision !== input.revision + 1 || result.state !== expectedState)
    )
      throw Error('Privacy outcome could not be verified.');
    options.touch();
    return { id: input.id, recorded: true };
  };
}
export function freezePrivacyInput(input: PrivacyInput): PrivacyInput {
  return Object.freeze({
    ...input,
    ...(input.details ? { details: Object.freeze({ ...input.details }) } : {}),
  });
}
