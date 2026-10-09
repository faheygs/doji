import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
export type AnnouncementCommand =
  | Readonly<{
      p_action: 'save_draft' | 'publish' | 'schedule';
      p_id: string | null;
      p_version: string | null;
      p_input: Readonly<Record<string, unknown>>;
      p_request_id: string;
    }>
  | Readonly<{
      p_action: 'cancel';
      p_id: string;
      p_version: string;
      p_reason: string;
      p_request_id: string;
    }>;
export const announcementVersion = (v: unknown) =>
  typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
const keys = (v: object, expected: string[]) =>
  Object.keys(v).sort().join(',') === expected.sort().join(',');
export function freezeAnnouncementCommand(input: AnnouncementCommand): AnnouncementCommand {
  if (
    !record(input) ||
    !uuid(input.p_request_id) ||
    !(input.p_id === null
      ? input.p_version === null
      : uuid(input.p_id) && announcementVersion(input.p_version))
  )
    throw Error('Invalid announcement command.');
  if (input.p_action === 'cancel') {
    if (
      !keys(input, ['p_action', 'p_id', 'p_version', 'p_reason', 'p_request_id']) ||
      !uuid(input.p_id) ||
      typeof input.p_reason !== 'string' ||
      input.p_reason !== input.p_reason.trim() ||
      input.p_reason.length < 8 ||
      input.p_reason.length > 1000
    )
      throw Error('Enter a cancellation reason of 8–1,000 characters.');
    return Object.freeze({ ...input });
  }
  if (
    !['save_draft', 'publish', 'schedule'].includes(input.p_action) ||
    !keys(input, ['p_action', 'p_id', 'p_version', 'p_input', 'p_request_id']) ||
    !record(input.p_input)
  )
    throw Error('Invalid announcement command.');
  const p = input.p_input;
  const fields = [
    'title',
    'body',
    'ends_at',
    'cta_label',
    'cta_url',
    'priority',
    'max_impressions_per_user',
    'min_hours_between_impressions',
    'reward_action',
    'reward_sparks',
  ];
  if (input.p_action !== 'publish') fields.push('starts_at');
  const text = (v: unknown, max: number) =>
    typeof v === 'string' && v === v.trim() && v.length > 0 && v.length <= max;
  const time = (v: unknown) =>
    typeof v === 'string' && v.length <= 80 && Number.isFinite(Date.parse(v));
  if (
    !keys(p, fields) ||
    !text(p.title, 100) ||
    !text(p.body, 600) ||
    !time(p.ends_at) ||
    (input.p_action !== 'publish' &&
      (!time(p.starts_at) || Date.parse(String(p.ends_at)) <= Date.parse(String(p.starts_at)))) ||
    ![0, 10, 20].includes(Number(p.priority)) ||
    typeof p.priority !== 'number' ||
    !Number.isInteger(p.max_impressions_per_user) ||
    Number(p.max_impressions_per_user) < 1 ||
    Number(p.max_impressions_per_user) > 10 ||
    !Number.isInteger(p.min_hours_between_impressions) ||
    Number(p.min_hours_between_impressions) < 1 ||
    Number(p.min_hours_between_impressions) > 720 ||
    !(
      (p.cta_label === null && p.cta_url === null) ||
      (text(p.cta_label, 40) &&
        ['/(app)/profile/shop', '/(app)/suggest-challenge'].includes(String(p.cta_url)))
    ) ||
    !(
      (p.reward_action === null && p.reward_sparks === 0) ||
      (p.reward_action === 'submit_idea' &&
        p.cta_url === '/(app)/suggest-challenge' &&
        Number.isInteger(p.reward_sparks) &&
        Number(p.reward_sparks) >= 1 &&
        Number(p.reward_sparks) <= 10000)
    )
  )
    throw Error('Invalid announcement settings.');
  return Object.freeze({ ...input, p_input: Object.freeze({ ...p }) });
}
