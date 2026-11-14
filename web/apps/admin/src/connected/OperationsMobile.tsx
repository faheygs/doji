import { useState } from 'react';
import {
  Alert,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { QueuePagination, TableFrame } from '@doji/ui';
import type { EmployeeHealth } from '@doji/portal-data/employee-health';

const phases = {
  upload: 'Post upload',
  submit: 'Submit response',
  receipt: 'Read submission receipt',
  feed: 'Display feed after submission',
  profile_read: 'Read profile',
  doji_read: 'Read Doji',
  feed_read: 'Read feed',
  social_read: 'Read social data',
  economy_read: 'Read Sparks / rewards',
  avatar_upload: 'Upload avatar',
};
const outcomes = {
  started: 'Started on device',
  confirmed: 'Device received a successful response',
  request_failed: 'Device reported a request failure',
  rendered: 'Device reported feed display',
};
export function OperationsMobile({
  data,
  loading,
  failed,
  retry,
}: {
  data: EmployeeHealth['mobile_workflows'] | undefined;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  if (loading) return <TableFrame label="device workflow reports" state="loading" footer={null} />;
  if (failed || !data || data.status === 'unavailable')
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" onClick={retry}>
            Retry
          </Button>
        }
      >
        Device workflow reports are unavailable. Missing reports do not mean zero failures.
      </Alert>
    );
  if (data.status === 'disabled')
    return (
      <Alert severity="info">Device workflow reporting is not enabled for this environment.</Alert>
    );
  const fresh =
    !!data.checked_at &&
    Date.parse(data.checked_at) <= Date.now() + 60000 &&
    Date.now() - Date.parse(data.checked_at) <= 180000;
  const current = Math.min(page, Math.max(0, Math.ceil(data.rows.length / size) - 1));
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography component="h2" variant="h5">
        Device workflow reports
      </Typography>
      <Typography>
        Optional reports received during the current hour and previous 23 hours. Counts describe
        device attempts, not unique people or confirmed server transactions. Reports may be delayed,
        dropped or capped; started and completed counts cannot be used to calculate a success rate.
      </Typography>
      <Typography variant="body2">
        Read checked: {new Date(data.checked_at!).toLocaleString()}. Last report received is a
        server receipt time, not the time the action happened.
      </Typography>
      {!fresh && (
        <Alert severity="warning">
          This device-report read is outdated. Retained counts are not a current health check.
        </Alert>
      )}
      {!data.rows.length ? (
        <Alert severity="info">
          No device reports received in this window. App health cannot be inferred.
        </Alert>
      ) : (
        <TableFrame
          label="device workflow reports"
          state="ready"
          footer={
            <QueuePagination
              page={current + 1}
              count={Math.min(size, data.rows.length - current * size)}
              totalCount={data.rows.length}
              rowsPerPage={size}
              hasPrevious={current > 0}
              hasNext={(current + 1) * size < data.rows.length}
              previous={() => setPage(current - 1)}
              next={() => setPage(current + 1)}
              onRowsPerPageChange={(value) => {
                setSize(value);
                setPage(0);
              }}
            />
          }
        >
          <Table aria-label="Device workflow reports">
            <TableHead>
              <TableRow>
                <TableCell>Workflow</TableCell>
                <TableCell>Platform</TableCell>
                <TableCell>Device outcome</TableCell>
                <TableCell align="right">Reported count</TableCell>
                <TableCell>Last report received</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.slice(current * size, (current + 1) * size).map((row) => (
                <TableRow key={`${row.platform}:${row.phase}:${row.outcome}`}>
                  <TableCell>{phases[row.phase]}</TableCell>
                  <TableCell>{row.platform === 'ios' ? 'iOS' : 'Android'}</TableCell>
                  <TableCell>{outcomes[row.outcome]}</TableCell>
                  <TableCell align="right">
                    {row.capped ? 'At least ' : ''}
                    {row.count.toLocaleString()}
                    {row.capped ? ' (capped)' : ''}
                  </TableCell>
                  <TableCell>{new Date(row.received_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Stack>
  );
}
