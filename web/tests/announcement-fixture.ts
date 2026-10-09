export const announcementId = '20000000-0000-4000-8000-000000000005';
export function announcementFixture() {
  return {
    id: announcementId,
    title: 'Synthetic member message',
    body: 'Synthetic announcement body.',
    created_at: '2026-10-08T12:00:00.123456Z',
    starts_at: '2026-10-09T12:00:00Z',
    ends_at: '2026-10-10T12:00:00Z',
    state: 'published',
    display_state: 'scheduled',
    managed: true,
    can_write: true,
    max_impressions_per_user: 2,
    min_hours_between_impressions: 24,
    priority: 0,
    cta_label: null,
    cta_url: null,
    private_field: 'Must not be projected',
  };
}
