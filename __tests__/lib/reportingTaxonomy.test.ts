import {
  isRestrictedSafetyDetail,
  reportDetailsFor,
  reportReasonsFor,
} from '../../lib/reportingTaxonomy';

describe('reporting taxonomy', () => {
  it('offers account-only impersonation without showing it for a post', () => {
    expect(reportReasonsFor('account').map((item) => item.value)).toContain('impersonation');
    expect(reportReasonsFor('post').map((item) => item.value)).not.toContain('impersonation');
  });

  it('provides specific leaf reasons for restricted goods and sexual safety', () => {
    expect(reportDetailsFor('restricted_goods', 'post').map((item) => item.value)).toEqual([
      'drugs',
      'weapons',
      'animals',
      'gambling',
      'alcohol_tobacco',
    ]);
    expect(reportDetailsFor('sexual_content', 'profile_photo').map((item) => item.value)).toContain(
      'child_sexual_content',
    );
  });

  it('classifies only the safety-critical leaves for restricted routing', () => {
    expect(isRestrictedSafetyDetail('credible_threat')).toBe(true);
    expect(isRestrictedSafetyDetail('child_sexual_content')).toBe(true);
    expect(isRestrictedSafetyDetail('adult_nudity_or_sexual_activity')).toBe(false);
    expect(isRestrictedSafetyDetail('spam')).toBe(false);
  });
});
