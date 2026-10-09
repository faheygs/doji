import { lazy, Suspense, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Chip, CircularProgress } from '@mui/material';
import { PageHeader, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { readModerationRecord, type ModerationKind } from '@doji/portal-data/moderation-record';
import { RecordLayout } from '../RecordLayout';
import { ModerationDetails, ModerationSummary } from './ModerationDetails';
import { ProtectedEvidence } from './ProtectedEvidence';
import { ModerationHistory } from './ModerationHistory';
const ModerationActions = lazy(() =>
  import('./ModerationActions').then((module) => ({ default: module.ModerationActions })),
);
import { useModerationCommand } from './useModerationCommand';

export function ModerationRecord({
  controller,
  kind,
  id,
  area,
}: {
  controller: EmployeeSessionController;
  kind: ModerationKind;
  id: string;
  area: string;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params] = useSearchParams();
  const fromSafety = params.get('fromSafety'),
    returnArea = params.get('returnArea');
  const safetyReturn =
    fromSafety &&
    /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(fromSafety) &&
    ['trust-safety', 'restricted-safety', 'my-work', 'overview'].includes(returnArea ?? '')
      ? '/' + returnArea + '/external/' + fromSafety
      : null;
  const command = useModerationCommand(controller);
  const allowed =
    !!state.session &&
    state.operator?.capabilities.moderation_read === true &&
    (area !== 'restricted-safety' || state.operator.capabilities.legal_read === true);
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'safety', { record: kind, id, area })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readModerationRecord(controller, kind, id, area, signal),
  });
  if (!allowed) return <Alert severity="error">Case access is unavailable.</Alert>;
  const item = query.isError ? undefined : query.data;
  return (
    <>
      <Button
        component={Link}
        to={
          safetyReturn ??
          (area === 'overview'
            ? '/'
            : params.get('from') === 'audit'
              ? '/audit'
              : '/' +
                area +
                (area !== 'my-work' && params.get('closed') === '1' ? '?closed=1' : ''))
        }
      >
        {safetyReturn
          ? 'Back to external request'
          : params.get('from') === 'audit'
            ? 'Back to audit log'
            : area === 'overview'
              ? 'Back to overview'
              : 'Back to queue'}
      </Button>
      <PageHeader
        title={kind === 'appeal' ? 'Moderation appeal' : 'Content report'}
        description={'Case ' + id}
        action={
          item && (
            <Chip
              variant="outlined"
              label={item.appeal?.appeal.status || item.report.summary.status || 'Unknown'}
            />
          )
        }
      />
      {command.message && (
        <Alert severity={command.uncertain || command.blocked ? 'warning' : 'success'}>
          {command.message}
        </Alert>
      )}
      {command.uncertain && (
        <Button variant="contained" disabled={command.busy} onClick={() => void command.submit()}>
          Retry same action
        </Button>
      )}
      {!item ? (
        <TableFrame
          label="case evidence"
          state={query.isError ? 'error' : 'loading'}
          footer={null}
          errorAction={<Button onClick={() => void query.refetch()}>Retry case read</Button>}
        />
      ) : (
        <>
          <RecordLayout summary={<ModerationSummary data={item} actor={state.operator!.user_id} />}>
            <ModerationDetails data={item} />
            <ModerationHistory item={item} />
            <ProtectedEvidence
              key={'current' + query.dataUpdatedAt}
              controller={controller}
              references={item.report.media}
              restricted={item.restricted}
              title="Current protected media"
              description="Open each item to request temporary employee-only access. This is current content, not a historical snapshot."
            />
            <ProtectedEvidence
              key={'preserved' + query.dataUpdatedAt}
              controller={controller}
              references={item.appeal?.preserved ?? item.report.preserved}
              restricted={item.restricted}
              title="Preserved decision media"
              description="Media retained for this exact decision. This is not a complete content snapshot."
            />
            <ProtectedEvidence
              key={'original' + query.dataUpdatedAt}
              controller={controller}
              references={item.appeal?.originalMedia ?? []}
              restricted={item.restricted}
              title="Original decision reference"
              description="The original decision's authorized media reference; not a guaranteed historical snapshot."
            />
          </RecordLayout>
          <Suspense fallback={<CircularProgress aria-label="Loading review actions" />}>
            <ModerationActions
              key={command.completed}
              controller={controller}
              item={item}
              fetching={query.isFetching}
              command={command}
              refresh={async () => {
                const result = await query.refetch();
                return result.isError ? undefined : result.data;
              }}
            />
          </Suspense>
        </>
      )}
    </>
  );
}
