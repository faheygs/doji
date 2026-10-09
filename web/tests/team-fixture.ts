export const teamActor = '10000000-0000-4000-8000-000000000001';
export const teamKey = '30000000-0000-4000-8000-000000000003';
export function teamFixture() {
  return {
    items: [
      {
        user_id: teamActor,
        username: 'employee@example.test',
        display_name: 'Synthetic employee',
        status: 'active',
        roles: ['operations'],
        last_changed_at: '2026-10-08T12:00:00Z',
      },
    ],
  };
}
