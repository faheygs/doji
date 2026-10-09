import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Stack } from '@mui/material';
import { portalKey } from '@doji/portal-data';
import { RecordSection, TableFrame } from '@doji/ui';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { PrivacyRecord } from '@doji/portal-data/privacy-record';
import { readPrivacyCorrection } from '@doji/portal-data/privacy-data';
import type { usePrivacyCommand } from './usePrivacyCommand';
import { PrivacyCorrectionForm } from './PrivacyCorrectionForm';
export function PrivacyCorrection({
  controller,
  item,
  command,
  refresh,
}: {
  controller: EmployeeSessionController;
  item: PrivacyRecord;
  command: ReturnType<typeof usePrivacyCommand>;
  refresh(): Promise<PrivacyRecord | undefined>;
}) {
  const state = controller.getSnapshot(),
    [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'work', {
          privacy: 'correction',
          id: item.id,
          revision: String(item.revision),
        })
      : ['denied'],
    enabled: !!state.session && open,
    gcTime: 0,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readPrivacyCorrection(controller, item, signal),
  });
  const mine = item.owner.assignedTo === state.operator?.user_id && item.owner.canDecide;
  if (!mine) return null;
  const disabled = command.busy || command.blocked || command.uncertain;
  if (!open)
    return (
      <Button disabled={disabled} onClick={() => setOpen(true)}>
        Review current draft for correction
      </Button>
    );
  const data = query.isError ? undefined : query.data;
  return (
    <RecordSection title="Correct current application draft">
      <Stack sx={{ gap: 2 }}>
        <Alert severity="info">
          This changes the editable draft only. The applicant must submit it through normal review.
          Submitted snapshots, agreements and credentials are not changed.
        </Alert>
        {!data ? (
          <TableFrame
            label="current editable draft"
            state={query.isError ? 'error' : 'loading'}
            footer={null}
            errorAction={
              <Button disabled={disabled} onClick={() => void query.refetch()}>
                Retry draft read
              </Button>
            }
          />
        ) : !data.allowed ? (
          <Alert severity="warning">{data.reason}</Alert>
        ) : (
          <PrivacyCorrectionForm
            key={command.completed}
            controller={controller}
            item={item}
            application={data.application}
            fetching={query.isFetching}
            command={command}
            refresh={refresh}
          />
        )}
      </Stack>
    </RecordSection>
  );
}
