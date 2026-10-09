import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import { privacyKinds } from './privacy-record';
import { privacyReference } from './privacy-command';
import type { createBusinessOwnership } from './business-claim';
export type PrivacyCreateInput = Readonly<{
  account: string;
  kind: keyof typeof privacyKinds;
  reference: string;
  due: string;
  key: string;
}>;
export function validPrivacyCreate(input: PrivacyCreateInput) {
  return (
    record(input) &&
    Object.keys(input).sort().join(',') === 'account,due,key,kind,reference' &&
    uuid(input.account) &&
    uuid(input.key) &&
    Object.hasOwn(privacyKinds, input.kind) &&
    typeof input.reference === 'string' &&
    privacyReference(input.reference) &&
    typeof input.due === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.due) &&
    Number.isFinite(Date.parse(input.due)) &&
    new Date(input.due).toISOString() === input.due
  );
}
export function createPrivacyRequest(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (input: PrivacyCreateInput, signal: AbortSignal) => {
    input = Object.freeze({ ...input });
    if (!validPrivacyCreate(input)) throw Error('Invalid privacy request.');
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
    const result = await options.transport
      .request('/business-privacy/open', {
        method: 'POST',
        body: {
          p_account_id: input.account,
          p_kind: input.kind,
          p_verification_reference: input.reference,
          p_due_at: input.due,
          p_request_id: input.key,
        },
      })
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    if (!record(result) || !uuid(result.id) || result.revision !== 1 || result.state !== 'open')
      throw Error('Privacy creation receipt could not be verified.');
    options.touch();
    return result.id;
  };
}
