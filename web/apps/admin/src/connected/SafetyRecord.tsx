import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, Typography } from '@mui/material';
import { PageHeader, RecordSection, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { readSafetyRecord, requestFields, type SafetyQueue } from '@doji/portal-data/safety-record';
import { RecordLayout } from '../RecordLayout';
import { SafetyOutcome } from './SafetyOutcome';
import { useSafetyCommand } from './useSafetyCommand';
import { useSafetyReport } from './useSafetyReport';
import { SafetyTarget } from './SafetyTarget';

export function SafetyRecord({
  controller,
  id,
  area,
}: {
  controller: EmployeeSessionController;
  id: string;
  area: string;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params] = useSearchParams();
  const command = useSafetyCommand(controller, id);
  const report = useSafetyReport(controller, id);
  const expectedQueue: SafetyQueue | undefined =
    area === 'my-work' || area === 'overview'
      ? undefined
      : area === 'restricted-safety'
        ? 'restricted_safety'
        : 'moderation';
  const allowed =
    !!state.session &&
    state.operator?.capabilities.moderation_read === true &&
    (expectedQueue !== 'restricted_safety' || state.operator.capabilities.legal_read === true);
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'safety', { record: 'external_intake', id, area })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readSafetyRecord(controller, id, signal, expectedQueue),
  });
  const refresh = async () => {
    const result = await query.refetch();
    return result.isError ? undefined : result.data;
  };
  if (!allowed) return <Alert severity="error">Safety access is unavailable.</Alert>;
  const item = query.isError ? undefined : query.data;
  return (
    <>
      <Button
        component={Link}
        to={
          area === 'overview'
            ? '/'
            : '/' + area + (area !== 'my-work' && params.get('closed') === '1' ? '?closed=1' : '')
        }
      >
        {area === 'overview' ? 'Back to overview' : 'Back to queue'}
      </Button>
      <PageHeader
        title="External removal request"
        description={'Case ' + id}
        action={item && <Chip label={item.state.replaceAll('_', ' ')} variant="outlined" />}
      />
      {report.message && (
        <Alert severity={report.uncertain || report.blocked ? 'warning' : 'success'}>
          {report.message}
        </Alert>
      )}
      {report.uncertain && (
        <Button variant="contained" disabled={report.busy} onClick={() => void report.submit()}>
          Retry same report
        </Button>
      )}
      {report.blocked && (
        <Button
          disabled={report.busy || query.isFetching}
          onClick={() => void refresh().then((item) => item && report.reset())}
        >
          Refresh report preparation
        </Button>
      )}
      {!item ? (
        <TableFrame
          label="safety record"
          state={query.isError ? 'error' : 'loading'}
          footer={null}
          errorAction={<Button onClick={() => void refresh()}>Retry record read</Button>}
        />
      ) : (
        <>
          <Alert severity="warning" sx={{ mb: 3 }}>
            Submitted information is an allegation, not a finding. Do not download or forward
            suspected illegal imagery.
          </Alert>
          <RecordLayout
            summary={
              <RecordSection title="Case details">
                <Box component="dl" sx={{ m: 0 }}>
                  {[
                    [
                      'Assignee',
                      item.assignedTo === null
                        ? 'Unassigned'
                        : item.assignedTo === state.operator?.user_id
                          ? state.operator.display_name + ' (you)'
                          : 'Employee ' + item.assignedTo,
                    ],
                    ['Source', 'External request'],
                    ['Queue', item.queue.replaceAll('_', ' ')],
                    ['Received', new Date(item.receivedAt).toLocaleString()],
                    ['Review target', new Date(item.deadlineAt).toLocaleString()],
                    ['Revision', String(item.revision)],
                    ['Category', item.reason],
                    ['Reason', item.detail],
                    ['Linked moderation report', item.reportId ?? 'Not linked'],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ mb: 2 }}>
                      <Typography component="dt" variant="body2" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                        {value || 'Not provided'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </RecordSection>
            }
          >
            <RecordSection title="Request details">
              <Box component="dl" sx={{ m: 0 }}>
                {requestFields
                  .filter((key) => !['reason', 'detail'].includes(key))
                  .map((key) => (
                    <Box key={key} sx={{ mb: 2 }}>
                      <Typography component="dt" variant="body2" color="text.secondary">
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </Typography>
                      <Typography
                        component="dd"
                        sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                      >
                        {item.request[key] || 'Not provided'}
                      </Typography>
                    </Box>
                  ))}
              </Box>
            </RecordSection>
            <RecordSection title="Requester receipt">
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{item.response}</Typography>
            </RecordSection>
            <RecordSection title="Review history">
              {!item.history.length && <Typography>No history recorded.</Typography>}
              {item.history.map((entry) => (
                <Box key={entry.id} sx={{ mb: 2, overflowWrap: 'anywhere' }}>
                  <Typography variant="subtitle1" component="h3">
                    {entry.action.replaceAll('_', ' ')} · {new Date(entry.at).toLocaleString()}
                  </Typography>
                  {entry.note && (
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                      Internal note: {entry.note}
                    </Typography>
                  )}
                  {entry.message && (
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                      Requester response: {entry.message}
                    </Typography>
                  )}
                </Box>
              ))}
              {item.history.length === 30 && (
                <Typography color="text.secondary">Showing the latest 30 entries.</Typography>
              )}
            </RecordSection>
          </RecordLayout>
          {item.reportId ? (
            <Button
              component={Link}
              to={
                '/' +
                (item.queue === 'restricted_safety' ? 'restricted-safety' : 'trust-safety') +
                '/report/' +
                item.reportId +
                '?fromSafety=' +
                id +
                '&returnArea=' +
                area
              }
            >
              Open linked moderation case
            </Button>
          ) : (
            item.canWrite &&
            !item.closedAt &&
            item.assignedTo === state.operator?.user_id &&
            state.operator.capabilities.moderation_write && (
              <SafetyTarget
                key={item.revision + ':' + report.generation}
                controller={controller}
                item={item}
                command={report}
                refresh={refresh}
                disabled={
                  query.isFetching ||
                  command.busy ||
                  command.uncertain ||
                  command.blocked ||
                  report.busy ||
                  report.uncertain ||
                  report.blocked
                }
              />
            )
          )}
          <SafetyOutcome
            command={command}
            controller={controller}
            item={item}
            fetching={query.isFetching}
            refresh={refresh}
            disabled={report.busy || report.uncertain || report.blocked}
          />
        </>
      )}
    </>
  );
}
