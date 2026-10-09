import { describe, expect, it } from 'vitest';
import { announcementDraft } from './announcement-draft';
import { prepareAnnouncement } from './announcement';
const raw = {
  id: '20000000-0000-4000-8000-000000000002',
  version: 'a'.repeat(32),
  state: 'draft',
  managed: true,
  can_write: true,
  title: 'Reward campaign',
  body: 'Send us a new idea',
  starts_at: '2026-11-01T06:30:00Z',
  ends_at: '2026-11-01T08:30:00Z',
  cta_label: 'Suggest',
  cta_url: '/(app)/suggest-challenge',
  priority: 10,
  max_impressions_per_user: 3,
  min_hours_between_impressions: 48,
  reward_action: 'submit_idea',
  reward_sparks: 80,
};
describe('authorized draft hydration', () => {
  it('round trips all material settings with the exact expected version', () => {
    const { initial, target } = announcementDraft(raw);
    const result = prepareAnnouncement(
      initial,
      'save_draft',
      Date.parse('2026-10-31Z'),
      target,
      '30000000-0000-4000-8000-000000000003',
    );
    expect(result.p_version).toBe(raw.version);
    expect(result.p_input).toMatchObject({
      cta_label: raw.cta_label,
      cta_url: raw.cta_url,
      reward_action: raw.reward_action,
      reward_sparks: raw.reward_sparks,
      priority: raw.priority,
      max_impressions_per_user: raw.max_impressions_per_user,
      min_hours_between_impressions: raw.min_hours_between_impressions,
    });
  });
  it.each([
    'reward_action',
    'reward_sparks',
    'priority',
    'max_impressions_per_user',
    'min_hours_between_impressions',
    'version',
    'can_write',
    'cta_label',
    'cta_url',
  ])('rejects a missing %s instead of overwriting saved data', (key) => {
    const value: Record<string, unknown> = { ...raw };
    delete value[key];
    expect(() => announcementDraft(value)).toThrow();
  });
  it.each([
    { state: 'published' },
    { state: 'cancelled' },
    { state: 'legacy' },
    { managed: false },
    { can_write: false },
    { allowed_actions: ['publish'] },
    { version: '1' },
    { starts_at: 'bad' },
    { reward_action: 'unknown' },
  ])('refuses a non-editable or unsupported record %j', (patch) => {
    expect(() => announcementDraft({ ...raw, ...patch })).toThrow();
  });
});
