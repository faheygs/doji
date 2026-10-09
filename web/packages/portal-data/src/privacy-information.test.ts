import { describe, expect, it } from 'vitest';
import {
  privacyAccess,
  privacyCorrection,
  validCorrectionDetails,
  readPrivacyAccess,
} from './privacy-data';
import { privacyCase } from './privacy-record';
import { freezePrivacyInput, validPrivacyInput, type PrivacyInput } from './privacy-command';
import { validPrivacyCreate } from './privacy-create';
import { createEmployeeSession } from './employee-session';
import {
  privacyFixture,
  privacyId,
  privacyAccount,
  privacyActor,
} from '../../../tests/privacy-fixture';
import {
  privacyCorrectionFixture,
  privacyInformation,
  privacyDraft,
} from '../../../tests/privacy-information-fixture';
const item = () => ({
  ...privacyCase(privacyFixture(), privacyId),
  owner: {
    assignedTo: privacyActor,
    label: 'Reviewer',
    sourceVersion: '32',
    revision: 2,
    canClaim: false,
    canRelease: true,
    canAssign: true,
    canDecide: true,
    actionable: true,
  },
});
const signal = () => new AbortController().signal;
const creation = {
  account: privacyAccount,
  kind: 'access' as const,
  reference: 'support-ref-001',
  due: '2026-10-20T12:00:00.000Z',
  key: '90000000-0000-4000-8000-000000000009',
};
describe('protected privacy information', () => {
  it('projects only bounded application information and retains provider-export gaps', () => {
    const data = privacyInformation();
    const parsed = privacyAccess({ ...data, secret: 'drop', identity_token: 'drop' }, item(), 0);
    expect(parsed).not.toHaveProperty('secret');
    expect(parsed.providerExportRequired).toBe(true);
    expect(parsed.identity).toBeNull();
    expect(parsed.next).toBe(30);
    expect(parsed.agreement).not.toHaveProperty('account_id');
    expect(parsed.submissions[0]).not.toHaveProperty('application_id');
    expect(privacyAccess(privacyInformation(30), item(), 30).next).toBeNull();
    for (const patch of [
      { account_id: privacyId },
      { case_id: privacyAccount },
      { provider_export_required: false },
      { identity: { email: 'x', name: 'x' } },
      { history_has_more: true, history: [] },
      { submissions: Array(51).fill(data.submissions[0]) },
      { history: [data.history[1], data.history[0]] },
    ])
      expect(() => privacyAccess({ ...data, ...patch }, item(), 0)).toThrow('verified');
    expect(
      privacyAccess(
        {
          ...data,
          identity_source: 'supabase_business',
          provider_export_required: false,
          identity: { name: 'Example', email: 'example@example.com', credentials: 'drop' },
        },
        item(),
        0,
      ).identity,
    ).toEqual({ name: 'Example', email: 'example@example.com' });
  });
  it('gates correction on case and application revisions without retaining blocked private details', () => {
    const data = privacyCorrectionFixture();
    expect(privacyCorrection(data, { ...item(), kind: 'correction' }).allowed).toBe(true);
    const blocked = privacyCorrection(
      { ...data, correction_allowed: false, blocked_reason: 'review_required' },
      item(),
    );
    expect(blocked).not.toHaveProperty('application');
    for (const patch of [
      { case_revision: 31 },
      { account_id: privacyId },
      { blocked_reason: 'unknown', correction_allowed: false },
      { application: { ...data.application, state: 'approved' } },
    ])
      expect(() => privacyCorrection({ ...data, ...patch }, item())).toThrow('verified');
  });
  it('validates draft fields, preserves address and snapshots nested retry content', () => {
    const draft = privacyDraft();
    expect(validCorrectionDetails(draft.details)).toBe(true);
    for (const patch of [
      { website: 'javascript:alert(1)' },
      { country: 'USA' },
      { purpose: 'a\nb' },
      { unrecognized: 'x' },
      { brand_name: 'x'.repeat(1001) },
    ])
      expect(validCorrectionDetails({ ...draft.details, ...patch })).toBe(false);
    const input: PrivacyInput = {
      id: privacyId,
      key: creation.key,
      revision: 32,
      ownerRevision: 2,
      state: 'open',
      action: 'correct_draft',
      reference: creation.reference,
      applicationRevision: 32,
      details: draft.details,
    };
    const frozen = freezePrivacyInput(input);
    draft.details.brand_name = 'Changed later';
    expect(frozen.details?.brand_name).toBe('Example brand');
    expect(frozen.details?.business_address).toBe('Retained address');
    expect(validPrivacyInput(frozen)).toBe(true);
    expect(validPrivacyInput({ ...frozen, applicationRevision: 0 })).toBe(false);
  });
  it('validates exact creation fields and canonical assessed deadline without inventing a future deadline', () => {
    expect(validPrivacyCreate(creation)).toBe(true);
    expect(validPrivacyCreate({ ...creation, due: '2020-01-01T00:00:00.000Z' })).toBe(true);
    for (const patch of [
      { due: '2026-02-30T00:00:00.000Z' },
      { account: 'member-name' },
      { reference: 'email@example.com' },
      { kind: 'other' },
      { extra: 'drop' },
    ])
      expect(validPrivacyCreate({ ...creation, ...patch } as typeof creation)).toBe(false);
  });
  it('creates with exact existing payload and validates receipts; protected reads require an open access case', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let receipt: unknown = { id: privacyId, revision: 1, state: 'open' };
    const controller = createEmployeeSession(
      {
        independentEmployeeIdentity: true,
        businessPrivacyEnabled: true,
        staffWorkflowEnabled: true,
      },
      {
        origin: 'https://admin.dojipro.com',
        upstream: async (url, init) => {
          if (url.endsWith('/api/session'))
            return Response.json({
              signedIn: true,
              assurance: 'aal2',
              csrf: 'c'.repeat(43),
              operator: {
                user_id: privacyActor,
                capabilities: { legal_read: true, operator_manage: true },
              },
            });
          if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
          const call = JSON.parse(String(init?.body));
          calls.push(call);
          return Response.json(
            call.name === 'get_admin_business_privacy_access_v1' ? privacyInformation() : receipt,
          );
        },
      },
    );
    await controller.restore();
    expect(await controller.createPrivacy(creation, signal())).toBe(privacyId);
    await controller.createPrivacy(creation, signal());
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]).toEqual({
      name: 'admin_business_privacy_open_v1',
      args: {
        p_account_id: privacyAccount,
        p_kind: 'access',
        p_verification_reference: creation.reference,
        p_due_at: creation.due,
        p_request_id: creation.key,
      },
    });
    receipt = { id: privacyId, revision: 2, state: 'open' };
    await expect(controller.createPrivacy(creation, signal())).rejects.toThrow('verified');
    await expect(
      readPrivacyAccess(controller, { ...item(), state: 'completed' }, 0, signal()),
    ).rejects.toThrow('Open verified');
    expect((await readPrivacyAccess(controller, item(), 0, signal())).providerExportRequired).toBe(
      true,
    );
    await controller.signOut();
  });
});
