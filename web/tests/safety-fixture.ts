export const safetyId = '30000000-0000-4000-8000-000000000003';
export const safetyActor = '10000000-0000-4000-8000-000000000001';
export function safetyFixture() {
  return {
    id: safetyId,
    revision: 1,
    state: 'received',
    queue: 'moderation',
    received_at: '2026-10-08T12:00:00Z',
    deadline_at: '2026-10-09T12:00:00Z',
    closed_at: null as string | null,
    assigned_to: null as string | null,
    report_id: null as string | null,
    can_write: true,
    request: {
      reason: 'harassment',
      detail: 'targeted',
      name: 'Synthetic requester',
      contact: 'fixture@example.com',
      statement: 'Synthetic request statement',
      location: 'Content reference supplied by fixture',
    },
    classification: { reason_label: 'Harassment', detail_label: 'Targeted harassment' },
    public_message: 'Your request is awaiting review.',
    access_review: null,
    copies_review: null,
    history: [
      {
        id: '40000000-0000-4000-8000-000000000004',
        action: 'received',
        occurred_at: '2026-10-08T12:00:00Z',
        internal_note: '',
        public_message: null,
      },
    ],
  };
}
