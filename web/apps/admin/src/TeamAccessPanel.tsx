import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  TablePagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Identity, PageHeader } from '@doji/ui';
import type { employeeDirectory } from '@doji/portal-data/employee-team';

/** Directory and focused editor share a mount so an uncertain command is never discarded. */
export function TeamAccessPanel({
  items,
  state,
  manage,
  retry,
  editor,
  canLeave = () => true,
}: {
  items: ReturnType<typeof employeeDirectory>;
  state: 'loading' | 'ready' | 'error';
  manage(email: string): boolean | void;
  retry(): void;
  editor: ReactNode;
  canLeave?(): boolean;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState('');
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (editing) editorHeading.current?.focus();
    else returnFocus.current?.focus();
  }, [editing]);
  const selected =
    state === 'ready' ? items.find((item) => item.email === selectedEmail) : undefined;
  const filtered = items.filter(
    (item) =>
      (status === 'all' || item.status === status) &&
      `${item.name} ${item.email} ${item.roles.join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pages);
  function open(email: string, button: HTMLButtonElement) {
    if (manage(email) === false) return;
    returnFocus.current = button;
    setSelectedEmail(email);
    setEditing(true);
  }
  return (
    <>
      <Box hidden={editing}>
        <PageHeader
          title="Team & access"
          description="Manage the people who keep Doji running."
          action={
            <Button
              variant="contained"
              disabled={state !== 'ready'}
              onClick={(event) => open('', event.currentTarget)}
            >
              Grant access
            </Button>
          }
        />
        <Stack component="section" aria-labelledby="team-people-title" sx={{ gap: 3 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            sx={{
              gap: 2,
              alignItems: { md: 'center' },
              justifyContent: 'space-between',
              pb: 2,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
              <Typography id="team-people-title" component="h2" variant="h6">
                People
              </Typography>
              {state === 'ready' && (
                <Chip
                  size="small"
                  label={items.length}
                  aria-label={`${items.length} loaded accounts`}
                />
              )}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2 }}>
              <TextField
                label="Search people"
                type="search"
                size="small"
                sx={{ width: { xs: '100%', sm: 300 } }}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
              <TextField
                select
                label="Account status"
                size="small"
                value={status}
                sx={{ minWidth: 180 }}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="all">All accounts</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="disabled">Disabled</MenuItem>
              </TextField>
            </Stack>
          </Stack>
          {state === 'ready' && items.length === 100 && (
            <Alert severity="info">
              Showing the first 100 employees. Search and filters apply to these accounts.
            </Alert>
          )}
          {state === 'loading' ? (
            <Stack
              role="status"
              sx={{ alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 2 }}
            >
              <CircularProgress size={32} aria-label="Loading employees" />
              <Typography color="text.secondary">Loading your team…</Typography>
            </Stack>
          ) : state === 'error' ? (
            <Alert severity="error" action={<Button onClick={retry}>Retry directory</Button>}>
              Employees could not be loaded.
            </Alert>
          ) : !filtered.length ? (
            <Stack
              role="status"
              sx={{ alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 2 }}
            >
              <Typography color="text.secondary">
                {items.length ? 'No people match these filters.' : 'No employee accounts returned.'}
              </Typography>
              {items.length > 0 && (
                <Button
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
          ) : (
            <>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
                  gap: 2.5,
                }}
              >
                {filtered.slice((current - 1) * 8, current * 8).map((item) => (
                  <Card
                    key={item.id}
                    variant="outlined"
                    component="article"
                    aria-label={item.name}
                    sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
                  >
                    <CardContent sx={{ p: 2.5, flex: 1 }}>
                      <Identity name={item.name} detail={item.email} />
                      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 2.5 }}>
                        {item.roles.map((role) => (
                          <Chip
                            key={role}
                            size="small"
                            label={role.replaceAll('_', ' ')}
                            variant="outlined"
                          />
                        ))}
                        {!item.roles.length && (
                          <Typography variant="body2" color="text.secondary">
                            No roles granted
                          </Typography>
                        )}
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="p"
                        sx={{ mt: 2 }}
                      >
                        Updated {new Date(item.changedAt).toLocaleDateString()}
                      </Typography>
                    </CardContent>
                    <Divider />
                    <CardActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
                      <Chip
                        size="small"
                        label={item.status}
                        color={item.status === 'active' ? 'success' : 'default'}
                        variant="outlined"
                      />
                      <Button
                        size="small"
                        onClick={(event) => open(item.email, event.currentTarget)}
                        aria-label={`Manage access for ${item.name}`}
                      >
                        Manage access
                      </Button>
                    </CardActions>
                  </Card>
                ))}
              </Box>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {filtered.length} matching {filtered.length === 1 ? 'account' : 'accounts'}
                </Typography>
                {pages > 1 && (
                  <TablePagination
                    component="div"
                    count={filtered.length}
                    rowsPerPage={8}
                    rowsPerPageOptions={[]}
                    page={current - 1}
                    onPageChange={(_, value) => setPage(value + 1)}
                  />
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Box>
      <Box hidden={!editing}>
        <Button
          sx={{ mb: 2 }}
          onClick={() => {
            if (canLeave()) setEditing(false);
          }}
        >
          Back to team
        </Button>
        <Typography ref={editorHeading} tabIndex={-1} component="h1" variant="h4" sx={{ mb: 1 }}>
          {selectedEmail ? 'Manage employee access' : 'Grant employee access'}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(240px, 320px) minmax(0, 760px)' },
            gap: 3,
            mt: 3,
            alignItems: 'start',
          }}
        >
          <Card variant="outlined" component="section" aria-label="Employee account">
            <CardContent sx={{ p: 3 }}>
              {selected ? (
                <>
                  <Identity name={selected.name} detail={selected.email} />
                  <Divider sx={{ my: 2.5 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Current access
                  </Typography>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Chip size="small" label={selected.status} variant="outlined" />
                    {selected.roles.map((role) => (
                      <Chip key={role} size="small" label={role.replaceAll('_', ' ')} />
                    ))}
                    {!selected.roles.length && (
                      <Typography variant="body2" color="text.secondary">
                        No roles granted
                      </Typography>
                    )}
                  </Stack>
                </>
              ) : (
                <>
                  <Typography variant="h6" component="h2">
                    Employee account
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {state !== 'ready'
                      ? 'Current account details are unavailable.'
                      : 'Use the email address of an existing verified employee account.'}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
          <Card variant="outlined" component="section" aria-label="Manage access">
            <CardContent sx={{ p: 3 }}>
              {state === 'error' && (
                <Alert
                  severity="error"
                  sx={{ mb: 2 }}
                  action={<Button onClick={retry}>Retry directory</Button>}
                >
                  Employees could not be loaded.
                </Alert>
              )}
              {editor}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </>
  );
}
