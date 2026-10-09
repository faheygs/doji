import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Chip, List, ListItem, ListItemText, Typography } from '@mui/material';
import { PageHeader, RecordSection, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { readIdeaRecord } from '@doji/portal-data/idea-record';
import { RecordLayout } from '../RecordLayout';
import { IdeaActions } from './IdeaActions';
import { useIdeaCommand } from './useIdeaCommand';
import { ideaFilters, type IdeaFilter } from '@doji/portal-data/idea-archive-path';

export function IdeaRecord({
  controller,
  id,
}: {
  controller: EmployeeSessionController;
  id: string;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params] = useSearchParams();
  const archive = params.get('archive');
  const history = ideaFilters.includes(archive as IdeaFilter);
  const command = useIdeaCommand(controller);
  const allowed = !!state.session && state.operator?.capabilities.operations_read === true;
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'work', { record: 'suggestion', id })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readIdeaRecord(controller, id, signal),
  });
  if (!allowed) return <Alert severity="error">Idea access is unavailable.</Alert>;
  const data = query.isError ? undefined : query.data;
  return (
    <>
      <Button
        component={Link}
        to={history ? '/community-ideas/archive?filter=' + archive : '/community-ideas'}
      >
        {history ? 'Back to idea history' : 'Back to Community Ideas'}
      </Button>
      <PageHeader
        title="Community idea"
        description={'Idea ' + id}
        action={data && <Chip label={data.idea.status} variant="outlined" />}
      />
      {command.message && (
        <Alert severity={command.uncertain || command.blocked ? 'warning' : 'success'}>
          {command.message}
        </Alert>
      )}
      {!data ? (
        <TableFrame
          label="community idea"
          state={query.isError ? 'error' : 'loading'}
          footer={null}
          errorAction={<Button onClick={() => void query.refetch()}>Retry record read</Button>}
        />
      ) : (
        <>
          <RecordLayout
            summary={
              <RecordSection title="Review details">
                <Typography>
                  Assignee: {data.owner.label}
                  {data.owner.assignedTo === state.operator!.user_id ? ' (you)' : ''}
                </Typography>
                <Typography>
                  Submitted:{' '}
                  {data.idea.createdAt
                    ? new Date(data.idea.createdAt).toLocaleString()
                    : 'Unavailable'}
                </Typography>
                {data.idea.challengeId && (
                  <Typography>
                    Challenge: {data.idea.challengeId} ·{' '}
                    {data.idea.poolActive ? 'In pool' : 'Not active in pool'}
                  </Typography>
                )}
                {data.idea.scheduledAt && (
                  <Typography>
                    Scheduled: {new Date(data.idea.scheduledAt).toLocaleString()}
                  </Typography>
                )}
                {data.idea.note && (
                  <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    Latest member response: {data.idea.note}
                  </Typography>
                )}
              </RecordSection>
            }
          >
            <RecordSection title="Submitted idea">
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {data.idea.body}
              </Typography>
              <Typography color="text.secondary">
                {data.idea.kind.replaceAll('_', ' ')} · {data.idea.author || 'Member unavailable'}
              </Typography>
              <List>
                {data.idea.options.map((option, index) => (
                  <ListItem key={index}>
                    <ListItemText primary={option} />
                  </ListItem>
                ))}
              </List>
              {!data.idea.supported && (
                <Alert severity="warning">
                  The response format is not supported. Acceptance is unavailable.
                </Alert>
              )}
              {data.idea.blocked && <Alert severity="warning">{data.idea.blocked}</Alert>}
            </RecordSection>

            <RecordSection title="Recent review history">
              {!data.idea.history.length && <Typography>No review decisions yet.</Typography>}
              <List>
                {data.idea.history.map((entry) => (
                  <ListItem key={entry.id}>
                    <ListItemText
                      primary={
                        entry.action.replace('editorial.', '') +
                        ' · ' +
                        new Date(entry.at).toLocaleString()
                      }
                      secondary={entry.reason}
                      slotProps={{
                        secondary: { sx: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } },
                      }}
                    />
                  </ListItem>
                ))}
              </List>
              {data.idea.history.length === 20 && (
                <Typography color="text.secondary">Latest 20 entries.</Typography>
              )}
            </RecordSection>
          </RecordLayout>
          <IdeaActions
            controller={controller}
            key={command.completed}
            data={data}
            operator={state.operator!}
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
