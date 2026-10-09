import { useState } from 'react';
import {
  Paper,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { QueuePagination, TableFrame } from '@doji/ui';
import { history, statusColor, type Scenario } from './model';

export function HealthHistory({
  scenario,
  issues = false,
}: {
  scenario: Scenario;
  issues?: boolean;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const connected = scenario !== 'disconnected';
  const label = issues ? 'App issue groups' : 'Doji delivery history';
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography color="text.secondary" variant="body2">
        {issues
          ? 'Illustrative issue groups. Unresolved does not mean an ongoing outage; occurrence counts may span the issue lifetime.'
          : 'Illustrative finalized summaries. Latency measures server publication, not handset receipt. Gaps stay visible.'}
      </Typography>
      <TableFrame
        label={label}
        state={connected ? 'ready' : 'empty'}
        emptyMessage="No monitoring data connected."
        footer={
          <QueuePagination
            page={1}
            count={connected ? (issues ? 2 : history.length) : 0}
            rowsPerPage={12}
            hasPrevious={false}
            hasNext={false}
            previous={() => {}}
            next={() => {}}
          />
        }
      >
        <Table stickyHeader aria-label={label} sx={{ minWidth: 670 }}>
          <TableHead>
            <TableRow>
              {(issues
                ? ['Issue', 'Scope', 'Occurrences', 'Last seen', 'State']
                : ['Doji date', 'p95 / max', 'Samples', 'Unpublished', 'Assessment']
              ).map((name) => (
                <TableCell key={name} scope="col">
                  {name}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {issues
              ? [
                  ['Push registration timeout', 'Member app', '3', '17:42 UTC'],
                  ['Feed read deadline', 'Member app', '1', '16:18 UTC'],
                ].map(([title, scope, count, last]) => (
                  <TableRow key={title} hover>
                    <TableCell component="th" scope="row">
                      <Button
                        variant="text"
                        onClick={() => setDetail(title!)}
                        sx={{ p: 0, justifyContent: 'flex-start', textAlign: 'left' }}
                      >
                        {title}
                      </Button>
                    </TableCell>
                    <TableCell>{scope}</TableCell>
                    <TableCell>{count}</TableCell>
                    <TableCell>{last} · sample</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label="Unresolved example"
                        variant="outlined"
                        color="warning"
                      />
                    </TableCell>
                  </TableRow>
                ))
              : history.map((row) => (
                  <TableRow key={row.day} hover>
                    <TableCell component="th" scope="row">
                      {row.day} · sample
                    </TableCell>
                    <TableCell>
                      {row.p95 === null ? 'Not measured' : `${row.p95} / ${row.max} ms`}
                    </TableCell>
                    <TableCell>{row.samples}</TableCell>
                    <TableCell>{row.overdue ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={row.result}
                        color={statusColor(row.result)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </TableFrame>
      {detail && (
        <Paper
          component="section"
          aria-label="Example issue details"
          variant="outlined"
          sx={{ p: 3 }}
        >
          <Typography component="h2" variant="h3">
            {detail}
          </Typography>
          <Typography sx={{ my: 2 }}>
            Synthetic investigation example: compare first and last occurrence, affected releases,
            platform, diagnostic session, failure phase and confirmed recovery before attributing a
            cause.
          </Typography>
          <Typography color="text.secondary" variant="body2">
            The current aggregate read supplies a group summary and a validated Sentry link—not
            device-level traces. Real evidence links will open the authorized issue; no synthetic
            case is linked to a real incident.
          </Typography>
          <Button onClick={() => setDetail(null)} sx={{ mt: 2 }}>
            Close example detail
          </Button>
        </Paper>
      )}
    </Stack>
  );
}
