import {
  Chip,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { Identity } from '@doji/ui';
import type { EmployeeOperator } from '@doji/portal-data/employee';
import type { WorkRow } from '../../../../../website/admin-portal/workflow-contracts.mts';
export const workLabels = {
  report: 'Content report',
  appeal: 'Appeal',
  external_intake: 'External request',
  suggestion: 'Community idea',
  business_application: 'Business application',
  business_privacy: 'Privacy request',
};
export function workPath(row: WorkRow, area: string, actor: EmployeeOperator, closed = false) {
  const cap = actor.capabilities;
  const safetyArea = area;
  const path =
    row.kind === 'business_application' && cap.business_read
      ? '/businesses/' + row.id
      : row.kind === 'external_intake' && cap.moderation_read
        ? '/' + safetyArea + '/external/' + row.id
        : ['report', 'appeal'].includes(row.kind) && cap.moderation_read
          ? '/' + safetyArea + '/' + row.kind + '/' + row.id
          : row.kind === 'suggestion' && cap.operations_read
            ? '/community-ideas/' + row.id
            : row.kind === 'business_privacy' && cap.legal_read && cap.operator_manage
              ? '/business-privacy/' + row.id + (area === 'my-work' ? '?from=my-work' : '')
              : null;
  return path && path + (closed ? '?closed=1' : '');
}
const states: Record<string, string> = {
  ready: 'Ready for review',
  waiting: 'Waiting',
  closed: 'Closed',
  received: 'Received',
  in_review: 'In review',
  awaiting_requester: 'Awaiting information',
  completed: 'Completed',
  removed: 'Removal recorded',
  pending_review: 'Pending review',
};
export function workColumns(area: string) {
  if (area === 'businesses') return ['Business', 'Received', 'Assignee', 'Status'];
  if (area === 'community-ideas') return ['Idea', 'Submitted', 'Assignee', 'Status'];
  if (area === 'my-work') return ['Record', 'Queue', 'Received', 'Review target', 'Status'];
  if (area === 'overview') return ['Record', 'Type', 'Received', 'Assignee', 'Status'];
  return ['Case', 'Source', 'Received', 'Assignee', 'Review target', 'Status'];
}
function Timestamp({ value }: { value: string | null }) {
  if (!value)
    return (
      <Typography variant="body2" color="text.secondary">
        Not set
      </Typography>
    );
  const date = new Date(value);
  return (
    <Stack component="time" dateTime={value}>
      <Typography variant="body2">
        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
      </Typography>
    </Stack>
  );
}
export function WorkTable({
  rows,
  area,
  actor,
  label,
  closed = false,
}: {
  rows: WorkRow[];
  area: string;
  actor: EmployeeOperator;
  label: string;
  closed?: boolean;
}) {
  const navigate = useNavigate();
  const columns = workColumns(area);
  const mixed = !['businesses', 'community-ideas'].includes(area);
  const target = area === 'my-work' || area.includes('safety');
  return (
    <Table
      stickyHeader
      aria-label={label}
      sx={{ minWidth: target ? 960 : area === 'overview' ? 940 : 680, tableLayout: 'fixed' }}
    >
      <TableHead>
        <TableRow>
          {columns.map((column, index) => (
            <TableCell
              key={column}
              scope="col"
              sx={{
                width:
                  column === 'Assignee' ? '20%' : index === 0 ? (mixed ? '30%' : '42%') : undefined,
              }}
            >
              {column}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const path = workPath(row, area, actor, closed);
          const status = row.status ?? row.work_state;
          return (
            <TableRow
              key={row.key}
              hover={!!path}
              tabIndex={path ? 0 : undefined}
              aria-label={path ? 'Open ' + row.subject : undefined}
              onKeyDown={(event) => {
                if (path && event.target === event.currentTarget && event.key === 'Enter')
                  navigate(path);
              }}
              sx={{
                cursor: path ? 'pointer' : undefined,
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: -2,
                },
              }}
              onClick={(event) => {
                if (
                  path &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.shiftKey &&
                  !(event.target as HTMLElement).closest('a,button')
                )
                  navigate(path);
              }}
            >
              <TableCell component="th" scope="row" sx={{ overflowWrap: 'anywhere' }}>
                <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
                  <Stack sx={{ minWidth: 0, gap: 0.5 }}>
                    {path ? (
                      <MuiLink
                        component={Link}
                        to={path}
                        underline="hover"
                        sx={{ fontWeight: 600, color: 'text.primary' }}
                      >
                        {row.kind === 'business_application' ? (
                          <Identity name={row.subject} organization />
                        ) : (
                          row.subject
                        )}
                      </MuiLink>
                    ) : (
                      <Typography variant="body2">{row.subject}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      Ref {row.id.slice(0, 8).toUpperCase()}
                    </Typography>
                  </Stack>
                </Stack>
              </TableCell>
              {mixed && <TableCell>{workLabels[row.kind]}</TableCell>}
              <TableCell>
                <Timestamp value={row.at} />
              </TableCell>
              {area !== 'my-work' && (
                <TableCell>
                  {row.assigned_to === actor.user_id ? (
                    <Identity name={actor.display_name} detail="Assigned to you" />
                  ) : (
                    <Identity
                      name={row.assigned_to ? 'Assigned employee' : 'Unassigned'}
                      known={false}
                    />
                  )}
                </TableCell>
              )}
              {target && (
                <TableCell>
                  <Timestamp value={row.due_at} />
                </TableCell>
              )}
              <TableCell>
                <Chip
                  label={states[status] ?? status.replaceAll('_', ' ')}
                  size="small"
                  variant="outlined"
                  color={
                    row.work_state === 'waiting'
                      ? 'warning'
                      : row.work_state === 'closed'
                        ? 'default'
                        : 'info'
                  }
                  sx={{
                    maxWidth: '100%',
                    height: 'auto',
                    minHeight: 24,
                    '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 },
                  }}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
