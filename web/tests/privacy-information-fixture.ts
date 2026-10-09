import { privacyId, privacyAccount } from './privacy-fixture';
export const privacyApplicationId = '60000000-0000-4000-8000-000000000006';
export const privacyDraft = () => ({
  id: privacyApplicationId,
  revision: 32,
  state: 'draft',
  response: '',
  details: {
    legal_name: 'Example business',
    brand_name: 'Example brand',
    website: 'https://example.com',
    country: 'US',
    business_address: 'Retained address',
    representative_name: 'Example representative',
    representative_role: 'Owner',
    category: 'Technology',
    purpose: 'Example purpose',
  },
});
export function privacyInformation(after = 0) {
  const app = privacyDraft();
  return {
    case_id: privacyId,
    account_id: privacyAccount,
    identity: null,
    identity_source: 'workos_business',
    provider_export_required: true,
    signup_agreement: {
      terms_version: 'terms-1',
      privacy_version: 'privacy-1',
      accepted_at: '2026-10-01T00:00:00Z',
      account_id: privacyAccount,
    },
    application: app,
    submissions: [
      {
        application_id: app.id,
        submission: 1,
        details: { brand_name: 'Original brand' },
        terms_version: 'terms-1',
        privacy_version: 'privacy-1',
        accepted_at: '2026-10-02T00:00:00Z',
      },
    ],
    history: Array.from({ length: Math.min(30, 32 - after) }, (_, i) => ({
      revision: after + i + 1,
      action: 'saved',
      response: 'Recorded response ' + (after + i + 1),
      occurred_at: '2026-10-03T00:00:00Z',
    })),
    history_has_more: after + 30 < 32,
  };
}
export function privacyCorrectionFixture() {
  return {
    case_id: privacyId,
    account_id: privacyAccount,
    case_revision: 32,
    correction_allowed: true,
    blocked_reason: null,
    application: privacyDraft(),
  };
}
