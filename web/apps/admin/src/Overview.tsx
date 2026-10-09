import { OverviewPanel } from './OverviewPanel';
import { destinations } from './navigation';
import type { WorkRow } from '@doji/portal-data/employee-queues';
const actor = {
  user_id: 'preview-employee',
  display_name: 'Alex Morgan',
  capabilities: {
    moderation_read: true,
    legal_read: true,
    business_read: true,
    operations_read: true,
    operator_manage: true,
  },
};
const samples: WorkRow[] = [
  { kind: 'external_intake', subject: 'Content removal request', assigned_to: null },
  { kind: 'business_application', subject: 'Northstar Studio', assigned_to: actor.user_id },
  { kind: 'suggestion', subject: 'What made you smile today?', assigned_to: null },
].map((row, index) => ({
  ...row,
  id: `sample-${index + 1}`,
  key: `sample-${index + 1}`,
  kind: row.kind as WorkRow['kind'],
  at: '2026-10-09T12:00:00Z',
  work_state: 'ready',
  due_at: null,
  ownership_model: 'staff_workflow',
}));
export function Overview() {
  return (
    <OverviewPanel
      actor={actor}
      destinations={destinations}
      rows={samples}
      state="ready"
      doji={{
        state: 'ready',
        data: {
          checkedAt: new Date().toISOString(),
          event: {
            id: 'preview',
            title: 'Capture a small moment of joy',
            firesAt: new Date(Date.now() + 3600000).toISOString(),
            preliveAt: null,
            activatedAt: null,
            closesAt: null,
          },
        },
      }}
    />
  );
}
