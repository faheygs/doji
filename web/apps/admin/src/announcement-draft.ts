import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import { announcementSchema } from './announcement';

/** Fail closed instead of defaulting omitted reward/display data during an edit. */
export function announcementDraft(value: unknown) {
  if (
    !record(value) ||
    !uuid(value.id) ||
    typeof value.version !== 'string' ||
    !/^[a-f0-9]{32}$/.test(value.version) ||
    value.state !== 'draft' ||
    value.managed !== true ||
    value.can_write !== true ||
    // The deployed announcement RPC exposes can_write + lifecycle, not an action list.
    // If a future server supplies a narrower action list, respect it.
    (Object.hasOwn(value, 'allowed_actions') &&
      (!Array.isArray(value.allowed_actions) || !value.allowed_actions.includes('save'))) ||
    typeof value.starts_at !== 'string' ||
    typeof value.ends_at !== 'string' ||
    ![null, 'submit_idea'].includes(value.reward_action as null | string) ||
    (value.cta_label !== null && typeof value.cta_label !== 'string') ||
    (value.cta_url !== null && typeof value.cta_url !== 'string')
  )
    throw Error('This draft is not editable. Refresh its complete authorized record.');
  const initial = announcementSchema.parse({
    title: value.title,
    message: value.body,
    timing: 'scheduled',
    start: Date.parse(value.starts_at),
    end: Date.parse(value.ends_at),
    ctaLabel: value.cta_label ?? '',
    ctaUrl: value.cta_url ?? '',
    priority: value.priority,
    impressions: value.max_impressions_per_user,
    spacing: value.min_hours_between_impressions,
    reward: value.reward_action ?? 'none',
    sparks: value.reward_sparks,
  });
  if (initial.start === null || initial.end === null || initial.end <= initial.start)
    throw Error('The saved display window could not be verified.');
  return { initial, target: { id: value.id, version: value.version } };
}
