import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { QueuePagination, TableFrame } from '@doji/ui';
import type {
  MonitorFamily,
  MonitorHistory,
} from '../../../../packages/portal-data/src/monitor-history';
const incidentNames: Record<MonitorFamily, string> = {
  'apns-provider-credentials': 'Apple notification credentials rejected',
  'domain-outbox-exhausted': 'Live-update delivery exhausted its attempts',
  'push-fanout-exhausted': 'Notification fanout exhausted its attempts',
  'domain-outbox-delayed': 'Live updates are delayed',
  'realtime-delivery-degraded': 'Live-update publication missed its target',
  'operational-health-check-failed': 'The platform check could not complete',
  'monitor-heartbeat-missing': 'The monitor stopped reporting',
};
const name = (source: string) => (source === 'worker' ? 'Platform monitor' : 'Independent monitor');
const at = (value: string) => new Date(value).toLocaleString();
export function OperationsIncidents({
  data,
  loading,
  failed,
  retry,
}: {
  data: MonitorHistory | undefined;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(5);
  if (loading) return <TableFrame label="monitor incidents" state="loading" footer={null} />;
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
        Monitor history is unavailable. This is not an empty history or proof of recovery.
      </Alert>
    );
  if (data.status === 'disabled')
    return (
      <Alert severity="info">Retained monitor history is not enabled for this environment.</Alert>
    );
  const current = Math.min(page, Math.max(0, Math.ceil(data.incidents.length / size) - 1));
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography variant="h5" component="h2">
        Monitor incidents
      </Typography>
      <Typography>
        Most recent 25 recorded incidents. A changed issue is not a confirmed recovery. These checks
        do not measure every app workflow or phone notification.
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2 }}>
        {data.latest.map((row) => {
          const fresh =
            row.observed_at &&
            Date.parse(row.observed_at) <= Date.now() + 30000 &&
            Date.now() - Date.parse(row.observed_at) <= 180000;
          const label = !row.observed_at
            ? 'No observation recorded'
            : !fresh
              ? 'Report is outdated'
              : row.state === 'healthy'
                ? 'Measured checks passed'
                : row.state === 'degraded'
                  ? 'Needs attention'
                  : 'Check could not complete';
          return (
            <Paper variant="outlined" key={row.monitor} sx={{ p: 2, flex: 1 }}>
              <Typography component="h3" variant="subtitle1">
                {name(row.monitor)}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                color={fresh && row.state === 'healthy' ? 'success' : 'warning'}
                label={label}
                sx={{ my: 1 }}
              />
              <Typography variant="body2">
                {row.observed_at
                  ? `Last observed ${at(row.observed_at)}`
                  : 'Continuous independent monitoring must be configured and verified separately.'}
              </Typography>
            </Paper>
          );
        })}
      </Stack>
      <TableFrame
        label="recorded monitor incidents"
        state={data.incidents.length ? 'ready' : 'empty'}
        footer={
          <QueuePagination
            page={current + 1}
            count={Math.min(size, data.incidents.length - current * size)}
            totalCount={data.incidents.length}
            rowsPerPage={size}
            hasPrevious={current > 0}
            hasNext={(current + 1) * size < data.incidents.length}
            previous={() => setPage(current - 1)}
            next={() => setPage(current + 1)}
            onRowsPerPageChange={(value) => {
              setSize(value);
              setPage(0);
            }}
          />
        }
      >
        <Table aria-label="Recorded monitor incidents">
          <TableHead>
            <TableRow>
              <TableCell>Issue</TableCell>
              <TableCell>Monitor</TableCell>
              <TableCell>First observed</TableCell>
              <TableCell>Last observed</TableCell>
              <TableCell>Recorded outcome</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.incidents.slice(current * size, (current + 1) * size).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{incidentNames[row.family]}</TableCell>
                <TableCell>{name(row.monitor)}</TableCell>
                <TableCell>{at(row.opened_at)}</TableCell>
                <TableCell>{at(row.last_observed_at)}</TableCell>
                <TableCell>
                  {row.ended_reason === 'recovered'
                    ? `Recovery observed ${at(row.ended_at!)}`
                    : row.ended_reason === 'superseded'
                      ? 'Issue changed; recovery not confirmed'
                      : 'Open at last observation'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Stack>
  );
}
