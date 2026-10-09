import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, CircularProgress, MenuItem, Stack, TextField } from '@mui/material';
import { portalKey } from '@doji/portal-data';
import { readCaseAssignees } from '@doji/portal-data/business-assignees';
import type { EmployeeSessionController } from '@doji/portal-data/employee';

export function BusinessAssigneePicker({
  controller,
  kind = 'business_application',
  id,
  owner,
  disabled,
  selected,
  select,
}: {
  controller: EmployeeSessionController;
  kind?: 'business_application' | 'suggestion' | 'business_privacy' | 'appeal';
  id: string;
  owner: string | null;
  disabled: boolean;
  selected: string;
  select(id: string): void;
}) {
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors.at(-1) ?? null;
  const query = useQuery({
    queryKey: session.session
      ? portalKey(session.session, 'work', { assignees: id, kind, after: cursor ?? '' })
      : ['denied'],
    enabled:
      !!session.session && !disabled && session.operator?.capabilities.operator_manage === true,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readCaseAssignees(controller, kind, id, cursor, signal),
  });
  const items = query.isError || query.isFetching ? [] : (query.data?.items ?? []);
  useEffect(() => {
    if (
      selected &&
      (query.isFetching || query.isError || !query.data?.items.some((item) => item.id === selected))
    )
      select('');
  }, [query.isFetching, query.isError, query.data, selected, select]);
  // Clearing selection on every page transition prevents selecting a hidden/stale employee.
  const navigate = (next: (string | null)[]) => {
    select('');
    setCursors(next);
  };
  return (
    <Stack sx={{ gap: 2 }}>
      {query.isFetching && <CircularProgress size={24} aria-label="Loading eligible reviewers" />}
      {query.isError ? (
        <Alert severity="error">
          Eligible reviewers could not be loaded. Close and refresh the record before reassigning.
        </Alert>
      ) : (
        <TextField
          select
          label="New assignee"
          value={items.some((x) => x.id === selected) ? selected : ''}
          disabled={disabled || query.isFetching || !items.length}
          onChange={(event) => select(event.target.value)}
        >
          {items.map((item) => (
            <MenuItem value={item.id} key={item.id} disabled={item.id === owner}>
              {item.label}
              {item.id === owner ? ' (current)' : ''}
            </MenuItem>
          ))}
        </TextField>
      )}
      {!query.isFetching && !query.isError && !items.length && (
        <Alert severity="info">No eligible reviewers on this page.</Alert>
      )}
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Button
          disabled={disabled || query.isFetching || query.isError || cursors.length === 1}
          onClick={() => navigate(cursors.slice(0, -1))}
        >
          Previous reviewers
        </Button>
        <Button
          disabled={disabled || query.isFetching || query.isError || !query.data?.next_cursor}
          onClick={() => navigate([...cursors, query.data!.next_cursor])}
        >
          Next reviewers
        </Button>
      </Stack>
    </Stack>
  );
}
