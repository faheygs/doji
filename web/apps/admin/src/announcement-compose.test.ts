import { describe, expect, it } from 'vitest';
import { emptyAnnouncement, prepareAnnouncement, validateAnnouncement } from './announcement';

const now = Date.parse('2026-11-01T06:00:00Z');
const key = '10000000-0000-4000-8000-000000000001';
const target = { id: '20000000-0000-4000-8000-000000000002', version: 'a'.repeat(32) };
const input = { ...emptyAnnouncement, title: ' Hello ', message: ' Welcome ', end: now + 7200000 };
describe('prepared atomic announcement contract', () => {
  it('uses one complete immutable payload and lets the server choose Publish now time', () => {
    const intent = prepareAnnouncement(input, 'publish', now, null, key);
    expect(intent).toEqual({
      p_action: 'publish',
      p_id: null,
      p_version: null,
      p_request_id: key,
      p_input: {
        title: 'Hello',
        body: 'Welcome',
        ends_at: '2026-11-01T08:00:00.000Z',
        cta_label: null,
        cta_url: null,
        priority: 0,
        max_impressions_per_user: 1,
        min_hours_between_impressions: 24,
        reward_action: null,
        reward_sparks: 0,
      },
    });
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.p_input)).toBe(true);
    expect('starts_at' in intent.p_input).toBe(false);
    expect('reason' in intent).toBe(false);
  });
  it('retains explicit reward/display terms and exact record version for editing', () => {
    const intent = prepareAnnouncement(
      {
        ...input,
        timing: 'scheduled',
        start: now + 3600000,
        reward: 'submit_idea',
        sparks: 500,
        ctaLabel: 'Suggest',
        ctaUrl: '/(app)/suggest-challenge',
        priority: 20,
        impressions: 4,
        spacing: 72,
      },
      'schedule',
      now,
      target,
      key,
    );
    expect(intent).toMatchObject({
      p_id: target.id,
      p_version: target.version,
      p_action: 'schedule',
      p_input: {
        starts_at: '2026-11-01T07:00:00.000Z',
        reward_action: 'submit_idea',
        reward_sparks: 500,
        priority: 20,
        max_impressions_per_user: 4,
        min_hours_between_impressions: 72,
      },
    });
  });
  it('allows saving a past dated draft without pretending it is scheduled', () => {
    const value = {
      ...input,
      timing: 'scheduled' as const,
      start: now - 7200000,
      end: now - 3600000,
    };
    expect(prepareAnnouncement(value, 'save_draft', now, target, key).p_action).toBe('save_draft');
    expect(() => prepareAnnouncement(value, 'schedule', now, target, key)).toThrow(/future/);
  });
  it('rejects mismatched action/timing, invalid IDs and non-finite time', () => {
    expect(() => prepareAnnouncement(input, 'schedule', now, null, key)).toThrow(/timing/);
    expect(() =>
      prepareAnnouncement(
        { ...input, timing: 'scheduled', start: now + 1 },
        'publish',
        now,
        null,
        key,
      ),
    ).toThrow(/timing/);
    expect(() => prepareAnnouncement(input, 'publish', now, null, 'bad')).toThrow(/reference/);
    expect(() =>
      prepareAnnouncement(input, 'publish', now, { ...target, version: '1' }, key),
    ).toThrow(/reference/);
    expect(validateAnnouncement(input, NaN).ok).toBe(false);
    expect(validateAnnouncement({ ...input, end: 1e30 }, now).ok).toBe(false);
  });
  it.each([
    { ctaLabel: 'Go' },
    { ctaUrl: '/(app)/profile/shop' },
    { ctaUrl: 'https://example.com', ctaLabel: 'Go' },
    { ctaLabel: 'x'.repeat(41), ctaUrl: '/(app)/profile/shop' },
    { reward: 'submit_idea', sparks: 2 },
    { sparks: 1 },
    { sparks: -1 },
    { reward: 'submit_idea', sparks: 10001, ctaUrl: '/(app)/suggest-challenge', ctaLabel: 'Go' },
    { impressions: 0 },
    { impressions: 11 },
    { impressions: 1.5 },
    { spacing: 0 },
    { spacing: 721 },
    { priority: 1 },
  ])('rejects incomplete or unsupported settings %j', (patch) => {
    expect(validateAnnouncement({ ...input, ...patch } as typeof input, now).ok).toBe(false);
  });
  it('keeps a scheduled UTC instant exact across the daylight-saving overlap', () => {
    for (const offset of [0, 3600000]) {
      const at = now + 60000 + offset;
      const value = prepareAnnouncement(
        { ...input, timing: 'scheduled', start: at },
        'schedule',
        now,
        null,
        key,
      );
      expect(Date.parse(value.p_input.starts_at!)).toBe(at);
    }
  });
});
