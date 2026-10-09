import {
  Chip,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { TableFrame } from '@doji/ui';
import type { EmployeeHealth, EmployeeHealthHistory } from '@doji/portal-data/employee-health';
import {
  eventState,
  labels,
  type HealthState,
} from '../../../../../website/admin-portal/health-model.mts';

export const healthColor = (state: HealthState) =>
  state === 'healthy'
    ? 'success'
    : state === 'unknown'
      ? 'default'
      : state === 'watch'
        ? 'warning'
        : 'error';
export const observation = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : 'Unavailable';
type LoadState = { loading: boolean; failed: boolean };
export function OperationsIssues({
  data,
  loading,
  failed,
  available,
}: LoadState & { data: EmployeeHealth['sentry']['issues']; available: boolean }) {
  return (
    <TableFrame
      label="App issue groups"
      state={loading ? 'loading' : failed || !available ? 'error' : data.length ? 'ready' : 'empty'}
      emptyMessage="No unresolved issues returned by this query."
      errorMessage="App-error monitoring is unavailable or outdated."
      footer={
        <Typography variant="caption" sx={{ p: 2 }}>
          Up to 25 unresolved groups · production query over 24 hours · occurrence and user counts
          may span an issue's lifetime
        </Typography>
      }
    >
      <Table stickyHeader aria-label="App issue groups" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            {['Issue / project', 'Occurrences / users', 'First seen', 'Last seen', 'Status'].map(
              (x) => (
                <TableCell key={x}>{x}</TableCell>
              ),
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={row.id ?? String(index)} hover>
              <TableCell component="th" scope="row">
                {row.permalink ? (
                  <Link href={row.permalink} target="_blank" rel="noopener noreferrer">
                    {row.title}
                  </Link>
                ) : (
                  row.title
                )}
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {row.project ?? 'Unknown project'}
                </Typography>
              </TableCell>
              <TableCell>
                {row.event_count ?? '—'} / {row.affected_users ?? '—'}
              </TableCell>
              <TableCell>{observation(row.first_seen)}</TableCell>
              <TableCell>{observation(row.last_seen)}</TableCell>
              <TableCell>{row.status ?? 'Unknown'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
export function OperationsHistory({
  data,
  loading,
  failed,
}: LoadState & { data: EmployeeHealthHistory }) {
  return (
    <TableFrame
      label="Doji delivery history"
      state={loading ? 'loading' : failed ? 'error' : data.length ? 'ready' : 'empty'}
      emptyMessage="No archived Doji summaries returned."
      errorMessage="Doji history could not be loaded."
      footer={
        <Typography variant="caption" sx={{ p: 2 }}>
          Latest {data.length} of at most 12 summaries · server publication, not phone receipt ·
          missing values are not zero
        </Typography>
      }
    >
      <Table stickyHeader aria-label="Doji delivery history" sx={{ minWidth: 850 }}>
        <TableHead>
          <TableRow>
            {[
              'Doji',
              'p95 / max (ms)',
              'Samples / over 5s',
              'Unpublished / exhausted',
              'Push expired / exhausted',
              'Assessment',
            ].map((x) => (
              <TableCell key={x}>{x}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.daily_event_id} hover>
              <TableCell component="th" scope="row">
                {row.title}
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {observation(row.fires_at)}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block' }}>
                  Observed through {observation(row.observed_through)}
                </Typography>
              </TableCell>
              <TableCell>
                {row.realtime_p95_ms ?? '—'} / {row.realtime_max_ms ?? '—'}
              </TableCell>
              <TableCell>
                {row.realtime_sample_count ?? '—'} / {row.realtime_over_5s ?? '—'}
              </TableCell>
              <TableCell>
                {row.outbox_unpublished ?? '—'} / {row.outbox_exhausted ?? '—'}
              </TableCell>
              <TableCell>
                {row.push_shards_expired ?? '—'} / {row.push_shards_exhausted ?? '—'}
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  variant="outlined"
                  color={healthColor(eventState(row))}
                  label={labels[eventState(row)]}
                />
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {row.finalized_at ? 'Finalized' : 'Still settling'}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
