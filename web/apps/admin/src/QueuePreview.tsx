import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Identity, PageHeader, QueuePagination, TableFrame } from '@doji/ui';
import type { WorkspaceDestination } from '@doji/ui';
import { workColumns } from './connected/WorkTable';

const pageSize = 10;
export function sampleRecords(area: string) {
  return Array.from({ length: 14 }, (_, index) => ({
    id: 'sample-' + (index + 1),
    title:
      area === '/audit'
        ? 'Sample review activity ' + (index + 1)
        : area === '/team'
          ? 'Sample employee ' + (index + 1)
          : area === '/businesses'
            ? 'Sample business application ' + (index + 1)
            : area === '/community-ideas'
              ? 'Sample community idea ' + (index + 1)
              : 'Sample review record ' + (index + 1),
    source: area.includes('safety')
      ? ['In-app report', 'External request', 'Appeal'][index % 3]!
      : area === '/businesses'
        ? 'Business application'
        : 'Sample record',
    owner: index % 3 === 0 ? 'Unassigned' : 'Preview employee',
    received: 'Oct 9, 2026',
    time: '9:30 AM',
    target: 'Oct 10, 2026',
    status:
      area === '/audit'
        ? 'Recorded'
        : area === '/team'
          ? 'Example role'
          : index % 3 === 0
            ? 'New'
            : 'In review',
  })).filter((record) => area !== '/my-work' || record.owner === 'Preview employee');
}

export function QueuePreview({ area }: { area: WorkspaceDestination }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'ready' | 'loading' | 'empty' | 'error'>('ready');
  const navigate = useNavigate();
  const records = sampleRecords(area.path).filter((row) =>
    (row.title + ' ' + row.id + ' ' + row.source).toLowerCase().includes(search.toLowerCase()),
  );
  const visible = records.slice((page - 1) * pageSize, page * pageSize);
  const readOnly = ['/audit', '/team'].includes(area.path);
  const personal = area.path === '/my-work';
  const safety = area.path.includes('safety');
  const privacy = area.path === '/business-privacy';
  const mixed = !['/businesses', '/community-ideas'].includes(area.path);
  const columns = readOnly
    ? ['Activity', 'Category', 'Recorded', 'Employee', 'Status']
    : privacy
      ? ['Request', 'Type', 'Received', 'Assignee', 'Assessed deadline', 'Status']
      : workColumns(area.path.slice(1));
  return (
    <>
      <PageHeader
        title={area.label}
        description={
          area.path === '/my-work'
            ? 'Your assigned reviews, in one place.'
            : 'Search the queue and open a record to see its details.'
        }
        action={<Chip label="Sample records" variant="outlined" sx={{ alignSelf: 'flex-start' }} />}
      />
      <TableFrame
        label={area.label}
        state={state === 'ready' && !visible.length ? 'empty' : state}
        emptyMessage="No sample records match this view."
        errorAction={
          <Link component="button" onClick={() => setState('ready')}>
            Try sample again
          </Link>
        }
        toolbar={
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ gap: 2, alignItems: { sm: 'center' } }}
          >
            <TextField
              size="small"
              label="Search records"
              helperText="Sample records only"
              sx={{ width: { sm: 320 } }}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <FormControl size="small" sx={{ minWidth: 180, ml: { sm: 'auto' } }}>
              <InputLabel id="queue-preview-state">Preview state</InputLabel>
              <Select
                labelId="queue-preview-state"
                label="Preview state"
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="ready">Sample records</MenuItem>
                <MenuItem value="loading">Loading</MenuItem>
                <MenuItem value="empty">Empty</MenuItem>
                <MenuItem value="error">Error</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        }
        footer={
          <QueuePagination
            page={page}
            count={state === 'ready' ? visible.length : 0}
            rowsPerPage={pageSize}
            totalCount={state === 'ready' ? records.length : undefined}
            state={state}
            hasPrevious={state === 'ready' && page > 1}
            hasNext={state === 'ready' && page * pageSize < records.length}
            previous={() => setPage((value) => value - 1)}
            next={() => setPage((value) => value + 1)}
          />
        }
      >
        <Table
          stickyHeader
          aria-label={area.label + ' sample records'}
          sx={{ minWidth: safety || personal || privacy ? 960 : 760, tableLayout: 'fixed' }}
        >
          <TableHead>
            <TableRow>
              {columns.map((column, index) => (
                <TableCell
                  key={column}
                  scope="col"
                  sx={{
                    width:
                      index === 0
                        ? mixed
                          ? '30%'
                          : '42%'
                        : column === 'Assignee'
                          ? '20%'
                          : undefined,
                  }}
                >
                  {column}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row) => (
              <TableRow
                hover
                key={row.id}
                tabIndex={0}
                aria-label={'Open ' + row.title}
                onClick={(event) => {
                  if (!(event.target instanceof Element) || event.target.closest('a,button'))
                    return;
                  navigate(area.path + '/' + row.id);
                }}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && event.key === 'Enter')
                    navigate(area.path + '/' + row.id);
                }}
                sx={{
                  cursor: 'pointer',
                  height: 76,
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                  },
                }}
              >
                <TableCell component="th" scope="row">
                  <Link
                    component={RouterLink}
                    to={area.path + '/' + row.id}
                    underline="hover"
                    sx={{ color: 'text.primary', fontWeight: 600, overflowWrap: 'anywhere' }}
                  >
                    {area.path === '/businesses' ? (
                      <Identity name={row.title} organization />
                    ) : (
                      row.title
                    )}
                  </Link>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {row.id.toUpperCase()}
                  </Typography>
                </TableCell>
                {mixed && <TableCell>{row.source}</TableCell>}
                <TableCell>
                  <Typography variant="body2">{row.received}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.time}
                  </Typography>
                </TableCell>
                {!personal && (
                  <TableCell>
                    <Identity
                      name={row.owner === 'Preview employee' ? 'Alex Morgan' : row.owner}
                      known={row.owner !== 'Unassigned'}
                      detail={row.owner === 'Preview employee' ? 'Assigned to you' : ''}
                    />
                  </TableCell>
                )}
                {(safety || personal || privacy) && <TableCell>{row.target}</TableCell>}
                <TableCell>
                  <Chip label={row.status} size="small" variant="outlined" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Layout examples only. Assignment, role and status labels are not connected to employee
          access.
        </Typography>
      </Box>
    </>
  );
}
