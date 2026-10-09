import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, CircularProgress, MenuItem, Stack, TextField } from '@mui/material';
import { RecordSection } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { SafetyRecord } from '@doji/portal-data/safety-record';
import { readSafetyTarget, targetKinds, type TargetKind } from '@doji/portal-data/safety-target';
import type { useSafetyReport } from './useSafetyReport';
import { SafetyTargetReview } from './SafetyTargetReview';
export function SafetyTarget({
  controller,
  item,
  disabled,
  command,
  refresh,
}: {
  controller: EmployeeSessionController;
  item: SafetyRecord;
  disabled: boolean;
  command: ReturnType<typeof useSafetyReport>;
  refresh(): Promise<SafetyRecord | undefined>;
}) {
  const state = controller.getSnapshot();
  const [kind, setKind] = useState<TargetKind>((item.targets[0] ?? 'post') as TargetKind),
    [id, setId] = useState(''),
    [inspection, setInspection] = useState<{ kind: TargetKind; id: string } | null>(null);
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'safety', {
          inspection: item.id,
          revision: String(item.revision),
          kind: inspection?.kind ?? '',
          target: inspection?.id ?? '',
        })
      : ['denied'],
    enabled: !!state.session && !!inspection && !command.busy && !command.uncertain,
    gcTime: 0,
    refetchOnMount: 'always',
    queryFn: ({ signal }) =>
      readSafetyTarget(controller, item, inspection!.kind, inspection!.id, signal),
  });
  const target = query.isError || query.isFetching ? undefined : query.data;
  if (!item.targets.length)
    return (
      <Alert severity="warning">
        Content inspection is unavailable for this category. Refresh the case before continuing.
      </Alert>
    );
  return (
    <RecordSection title="Identify the exact content">
      <Stack sx={{ gap: 2 }}>
        <Alert severity="info">
          Use the exact content ID from the original request. Inspection is an audited read; it does
          not take moderation action.
        </Alert>
        <TextField
          select
          label="Content type"
          value={kind}
          disabled={disabled}
          onChange={(event) => {
            setKind(event.target.value as TargetKind);
            setInspection(null);
          }}
        >
          {item.targets.map((value) => (
            <MenuItem key={value} value={value}>
              {targetKinds[value as TargetKind]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Exact content ID"
          value={id}
          disabled={disabled}
          slotProps={{ htmlInput: { maxLength: 36, autoComplete: 'off' } }}
          onChange={(event) => {
            setId(event.target.value);
            setInspection(null);
          }}
        />
        <Button
          disabled={
            disabled ||
            query.isFetching ||
            !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id.trim())
          }
          onClick={() =>
            inspection ? void query.refetch() : setInspection({ kind, id: id.trim().toLowerCase() })
          }
        >
          Inspect content
        </Button>
        {query.isFetching && (
          <CircularProgress aria-label="Inspecting exact content" sx={{ alignSelf: 'center' }} />
        )}
        {query.isError && (
          <Alert severity="error">
            Exact content could not be verified. No report has been created.
          </Alert>
        )}
        {target && (
          <SafetyTargetReview
            key={target.fingerprint + query.dataUpdatedAt}
            item={item}
            target={target}
            disabled={disabled}
            submit={(note) => command.submit({ item, target, note, refresh })}
          />
        )}
      </Stack>
    </RecordSection>
  );
}
