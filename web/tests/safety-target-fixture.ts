import { safetyId, safetyActor } from './safety-fixture';
export const targetId = '60000000-0000-4000-8000-000000000006';
export const linkedReportId = '70000000-0000-4000-8000-000000000007';
export function targetFixture() {
  return {
    case_id: safetyId,
    id: targetId,
    kind: 'post',
    owner_id: safetyActor,
    username: 'synthetic-owner',
    fingerprint: 'a'.repeat(64),
    detail: {
      text: '<img src=x onerror=alert(1)> Synthetic content',
      state: 'visible',
      photo_ref: 'private/reference-must-not-render.jpg',
    },
  };
}
