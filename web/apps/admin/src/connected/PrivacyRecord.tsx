import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { PageHeader, QueuePagination, RecordSection, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import {
  canReadPrivacy,
  privacyKinds,
  privacyStates,
  readPrivacyRecord,
} from '@doji/portal-data/privacy-record';
import { RecordLayout } from '../RecordLayout';
import { PrivacyActions } from './PrivacyActions';
import { usePrivacyCommand } from './usePrivacyCommand';
import { PrivacyAccess } from './PrivacyAccess';
import { PrivacyCorrection } from './PrivacyCorrection';
import { useBatchPagination } from './useBatchPagination';
import { personalReturn } from './personal-return';

export function PrivacyRecord({
  controller,
  id,
}: {
  controller: EmployeeSessionController;
  id: string;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params] = useSearchParams();
  const command = usePrivacyCommand(controller);
  const [after, setAfter] = useState(0);
  const allowed = !!state.session && canReadPrivacy(controller);
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'work', { privacy: 'record', id, after: String(after) })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readPrivacyRecord(controller, id, after, signal),
  });
  const item = query.isError ? undefined : query.data;
  const paged = useBatchPagination({
    rows: item?.history ?? [],
    batchSize: 30,
    batchPage: Math.floor(after / 30) + 1,
    scope: id,
    loading: query.isFetching,
    failed: query.isError,
    hasNext: item?.nextRevision != null,
    reset: () => setAfter(0),
    previous: () => setAfter(Math.max(0, after - 30)),
    next: () => {
      if (item?.nextRevision != null) setAfter(item.nextRevision);
    },
  });
  if (!allowed) return <Alert severity="error">Privacy review access is unavailable.</Alert>;
  const filter = params.get('state') ?? '';
  const back =
    params.get('from') === 'my-work'
      ? personalReturn(params)!
      : '/business-privacy' + (Object.hasOwn(privacyStates, filter) ? '?state=' + filter : '');
  return (
    <>
      <Button component={Link} to={back}>
        {params.get('from') === 'my-work' ? 'Back to my work' : 'Back to privacy requests'}
      </Button>
      <PageHeader
        title="Business privacy request"
        description={'Case ' + id}
        action={item && <Chip label={privacyStates[item.state]} variant="outlined" />}
      />
      {command.message && (
        <Alert severity={command.uncertain || command.blocked ? 'warning' : 'info'}>
          {command.message}
        </Alert>
      )}
      {command.uncertain && (
        <Button variant="contained" disabled={command.busy} onClick={() => void command.submit()}>
          Retry identical action
        </Button>
      )}
      {command.blocked && (
        <Button
          disabled={query.isFetching}
          onClick={() =>
            void query.refetch().then((result) => {
              if (!result.isError && result.data) command.refreshed();
            })
          }
        >
          Refresh record
        </Button>
      )}
      {!item ? (
        <TableFrame
          label="privacy request"
          state={query.isError ? 'error' : 'loading'}
          errorAction={<Button onClick={() => void query.refetch()}>Retry privacy record</Button>}
          footer={
            after > 0 ? (
              <Button onClick={() => setAfter(Math.max(0, after - 30))}>
                Previous history page
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <RecordLayout
            summary={
              <>
                <RecordSection title="Request details">
                  <Box component="dl" sx={{ m: 0 }}>
                    {[
                      ['Request type', privacyKinds[item.kind]],
                      ['Business account', item.accountId],
                      [
                        'Assignee',
                        item.owner.label +
                          (item.owner.assignedTo === state.operator!.user_id ? ' (you)' : ''),
                      ],
                      ['Revision', String(item.revision)],
                      ['Recorded in workflow', new Date(item.received).toLocaleString()],
                      ['Assessed response deadline', new Date(item.due).toLocaleString()],
                      ['Verification reference', item.verification],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ mb: 2 }}>
                        <Typography component="dt" variant="body2" color="text.secondary">
                          {label}
                        </Typography>
                        <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                          {value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <Typography color="text.secondary">
                    The assessed deadline is based on the original support request, not the date
                    this case was recorded.
                  </Typography>
                </RecordSection>
                <RecordSection title="Retention hold">
                  {item.hold ? (
                    <>
                      <Typography>Active · {item.hold.reference}</Typography>
                      <Typography>Owner case: {item.hold.caseId}</Typography>
                      {item.hold.caseId !== id && (
                        <Button component={Link} to={'/business-privacy/' + item.hold.caseId}>
                          Open hold-owning case
                        </Button>
                      )}
                    </>
                  ) : (
                    <Typography>No active hold returned for this business.</Typography>
                  )}
                </RecordSection>
              </>
            }
          >
            {item.kind === 'erasure' && (
              <Alert severity="info">
                Preparing erasure is not deletion. Primary data erasure is not final completion;
                remaining copies require separate review.
              </Alert>
            )}
            {item.kind === 'access' && item.state === 'open' && (
              <PrivacyAccess
                key={item.id + ':' + item.revision + ':' + item.owner.revision}
                controller={controller}
                item={item}
              />
            )}
            <TableFrame
              label="privacy case history"
              toolbar={
                item.kind === 'correction' ? (
                  <Button
                    disabled={query.isFetching}
                    onClick={() => setAfter(Math.floor((item.revision - 1) / 30) * 30)}
                  >
                    Latest case history
                  </Button>
                ) : undefined
              }
              state={item.history.length ? 'ready' : 'empty'}
              emptyMessage="No history entries on this page."
              footer={<QueuePagination {...paged.pagination} />}
            >
              <Table stickyHeader aria-label="Privacy case history" sx={{ minWidth: 700 }}>
                <TableHead>
                  <TableRow>
                    {['Revision', 'Action', 'Recorded', 'Evidence reference'].map((label) => (
                      <TableCell key={label}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.rows.map((entry) => (
                    <TableRow key={entry.revision}>
                      <TableCell>{entry.revision}</TableCell>
                      <TableCell>{entry.action.replaceAll('_', ' ')}</TableCell>
                      <TableCell>{new Date(entry.at).toLocaleString()}</TableCell>
                      <TableCell>{entry.reference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
            {item.kind === 'correction' && item.state === 'open' && (
              <>
                <PrivacyCorrection
                  controller={controller}
                  item={item}
                  command={command}
                  refresh={async () => {
                    const result = await query.refetch();
                    return result.isError ? undefined : result.data;
                  }}
                />
                <Alert severity="info">
                  After saving the correction, open its case-history page to make Complete request
                  available. Completion records fulfillment; it does not notify the requester.
                </Alert>
              </>
            )}
          </RecordLayout>
          <PrivacyActions
            controller={controller}
            key={command.completed}
            item={item}
            actor={state.operator!.user_id}
            fetching={query.isFetching}
            command={command}
            refresh={async () => {
              const result = await query.refetch();
              return result.isError ? undefined : result.data;
            }}
          />
        </>
      )}
    </>
  );
}
