import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import { businessApplication } from './business-record';
import { createBusinessClaim, createBusinessOwnership } from './business-claim';

export const businessDecisions = {
  approve: {
    label: 'Approve application',
    state: 'approved',
    effect: 'Grants business workspace access. Billing and campaign publishing remain disabled.',
  },
  request_changes: {
    label: 'Request changes',
    state: 'changes_requested',
    effect: 'Returns the application to the applicant for updates and resubmission.',
  },
  decline: {
    label: 'Decline application',
    state: 'declined',
    effect: 'Closes this application without granting business workspace access.',
  },
  reopen: {
    label: 'Reopen application',
    state: 'changes_requested',
    effect:
      'Returns the application for changes and suspends any approved business workspace access.',
  },
} as const;
export type BusinessDecisionAction = keyof typeof businessDecisions;
export type BusinessDecision = Readonly<{
  p_id: string;
  p_revision: number;
  p_action: BusinessDecisionAction;
  p_response: string;
  p_internal_note: string;
  p_request_id: string;
}>;
export function validBusinessDecision(input: BusinessDecision) {
  const text = (value: unknown, max: number) =>
    typeof value === 'string' &&
    value === value.trim() &&
    [...value].length >= 8 &&
    value.length <= max;
  return (
    record(input) &&
    Object.keys(input).sort().join(',') ===
      'p_action,p_id,p_internal_note,p_request_id,p_response,p_revision' &&
    uuid(input.p_id) &&
    uuid(input.p_request_id) &&
    Number.isSafeInteger(input.p_revision) &&
    input.p_revision >= 0 &&
    input.p_revision < Number.MAX_SAFE_INTEGER &&
    Object.hasOwn(businessDecisions, input.p_action) &&
    text(input.p_response, 1000) &&
    text(input.p_internal_note, 2000)
  );
}
export function decisionReceipt(value: unknown, input: BusinessDecision) {
  if (!record(value) || !record(value.outcome) || typeof value.replayed !== 'boolean')
    throw Error('Decision outcome could not be verified.');
  const outcome = value.outcome;
  const expected = businessDecisions[input.p_action].state;
  if (
    outcome.id !== input.p_id ||
    outcome.action !== input.p_action ||
    outcome.revision !== input.p_revision + 1 ||
    outcome.state !== expected
  )
    throw Error('Decision outcome could not be verified.');
  // An idempotent replay may include a newer current application, not the old outcome snapshot.
  const application = businessApplication(value.application, input.p_id);
  if (
    application.revision < outcome.revision ||
    (application.revision === outcome.revision && application.state !== expected)
  )
    throw Error('Decision application could not be verified.');
  return {
    id: input.p_id,
    revision: outcome.revision,
    action: input.p_action,
    replayed: value.replayed,
  };
}
export function createBusinessCommands(options: Parameters<typeof createBusinessClaim>[0]) {
  return {
    claimBusiness: createBusinessClaim(options),
    changeBusinessOwnership: createBusinessOwnership(options),
    async decideBusiness(input: BusinessDecision, signal: AbortSignal) {
      if (!validBusinessDecision(input))
        throw Error('A valid decision, applicant response and internal note are required.');
      const captured = options.state();
      const current = () => {
        signal.throwIfAborted();
        const state = options.state();
        if (
          state.phase !== 'ready' ||
          !captured.session ||
          state.session !== captured.session ||
          state.operator?.capabilities.business_read !== true ||
          state.operator.capabilities.operator_manage !== true
        )
          throw Error('Employee decision permission required.');
        options.transport.assertSessionFresh();
      };
      if (!options.transport.hasSession()) {
        await options.signOut();
        throw Error('Employee session expired.');
      }
      current();
      const value = await options.transport
        .request('/business/command', { method: 'POST', body: { ...input } })
        .catch(async (error: unknown) => {
          if (record(error) && error.status === 403 && options.state().session === captured.session)
            await options.restore();
          throw error;
        });
      current();
      const receipt = decisionReceipt(value, input);
      options.touch();
      return receipt;
    },
  };
}
