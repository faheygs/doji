import { z } from 'zod';

// Prepared for the gated atomic compose contract; never dispatches a request.
export const announcementDestinations = {
  '': 'No action button',
  '/(app)/profile/shop': 'Sparks shop',
  '/(app)/suggest-challenge': 'Suggest a Doji',
} as const;
export const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(100, 'Use 100 characters or fewer.'),
  message: z.string().trim().min(1, 'Enter a message.').max(600, 'Use 600 characters or fewer.'),
  timing: z.enum(['now', 'scheduled']),
  start: z.number().finite().nullable(),
  end: z.number().finite().nullable(),
  ctaLabel: z.string().trim().max(40, 'Use 40 characters or fewer for the button.'),
  ctaUrl: z.enum(['', '/(app)/profile/shop', '/(app)/suggest-challenge']),
  priority: z.union([z.literal(0), z.literal(10), z.literal(20)]),
  impressions: z.number().int().min(1).max(10),
  spacing: z.number().int().min(1).max(720),
  reward: z.enum(['none', 'submit_idea']),
  sparks: z.number().int().min(0).max(10000),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type ComposeAction = 'save_draft' | 'publish' | 'schedule';
export const emptyAnnouncement: AnnouncementInput = {
  title: '',
  message: '',
  timing: 'now',
  start: null,
  end: null,
  ctaLabel: '',
  ctaUrl: '',
  priority: 0,
  impressions: 1,
  spacing: 24,
  reward: 'none',
  sparks: 0,
};

export function validateAnnouncement(
  input: AnnouncementInput,
  now: number,
  action: ComposeAction = input.timing === 'scheduled' ? 'schedule' : 'publish',
) {
  const base = announcementSchema.safeParse(input);
  if (!base.success)
    return { ok: false as const, errors: base.error.issues.map((issue) => issue.message) };
  if (!Number.isFinite(now) || !['save_draft', 'publish', 'schedule'].includes(action))
    return { ok: false as const, errors: ['Choose a valid action and time.'] };
  if (
    (action === 'publish' && input.timing !== 'now') ||
    (action === 'schedule' && input.timing !== 'scheduled')
  )
    return { ok: false as const, errors: ['Review the selected publication timing.'] };
  const start = input.timing === 'now' ? now : input.start;
  if (start === null || (action === 'schedule' && start <= now))
    return { ok: false as const, errors: ['Choose a future start date and time.'] };
  if (
    !Number.isFinite(new Date(start).getTime()) ||
    input.end === null ||
    !Number.isFinite(new Date(input.end).getTime()) ||
    input.end <= start ||
    (action !== 'save_draft' && input.end <= now)
  )
    return { ok: false as const, errors: ['The end must be after the start.'] };
  if (Boolean(base.data.ctaLabel) !== Boolean(base.data.ctaUrl))
    return {
      ok: false as const,
      errors: ['Choose both a button label and destination, or neither.'],
    };
  if (
    input.reward === 'submit_idea' &&
    (input.sparks < 1 || input.ctaUrl !== '/(app)/suggest-challenge')
  )
    return {
      ok: false as const,
      errors: ['An idea reward needs the Suggest a Doji destination and 1–10,000 Sparks.'],
    };
  if (input.reward === 'none' && input.sparks !== 0)
    return { ok: false as const, errors: ['Remove the Sparks amount when no reward is selected.'] };
  return {
    ok: true as const,
    value: {
      ...base.data,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(input.end).toISOString(),
    },
  };
}

/** One immutable intent. The server chooses Publish now's start and owns eligibility. */
export function prepareAnnouncement(
  input: AnnouncementInput,
  action: ComposeAction,
  now: number,
  target: { id: string; version: string } | null,
  requestId: string,
) {
  const checked = validateAnnouncement(input, now, action);
  const id = /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
  if (!checked.ok) throw Error(checked.errors.join(' '));
  if (
    !id.test(requestId) ||
    (target && (!id.test(target.id) || !/^[a-f\d]{32}$/.test(target.version)))
  )
    throw Error('The announcement reference could not be verified.');
  const v = checked.value;
  const payload = Object.freeze({
    title: v.title,
    body: v.message,
    ...(action === 'publish' ? {} : { starts_at: v.startsAt }),
    ends_at: v.endsAt,
    cta_label: v.ctaLabel || null,
    cta_url: v.ctaUrl || null,
    priority: v.priority,
    max_impressions_per_user: v.impressions,
    min_hours_between_impressions: v.spacing,
    reward_action: v.reward === 'none' ? null : v.reward,
    reward_sparks: v.sparks,
  });
  return Object.freeze({
    p_action: action,
    p_id: target?.id ?? null,
    p_version: target?.version ?? null,
    p_input: payload,
    p_request_id: requestId,
  });
}
export type AnnouncementIntent = ReturnType<typeof prepareAnnouncement>;
