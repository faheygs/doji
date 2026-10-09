import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Chip, Typography } from '@mui/material';
import { PageHeader, RecordSection, type WorkspaceDestination } from '@doji/ui';
import { sampleRecords } from './QueuePreview';
import { RecordFields, RecordLayout } from './RecordLayout';

export function RecordPreview({ area }: { area: WorkspaceDestination }) {
  const { id } = useParams();
  const record = sampleRecords(area.path).find((item) => item.id === id);
  if (!record)
    return (
      <>
        <PageHeader title="Record not found" />
        <Button component={Link} to={area.path}>
          Back to {area.label}
        </Button>
      </>
    );
  return (
    <>
      <Button component={Link} to={area.path} sx={{ mb: 2 }}>
        ← {area.label}
      </Button>
      <PageHeader
        title={record.title}
        description={record.id.toUpperCase()}
        action={
          <Chip
            label={record.status + ' · sample'}
            variant="outlined"
            sx={{ alignSelf: 'flex-start' }}
          />
        }
      />
      <RecordLayout
        summary={
          <RecordSection title="At a glance">
            <RecordFields
              rows={[
                [
                  'Assignee',
                  record.owner === 'Preview employee' ? 'Alex Morgan (you)' : record.owner,
                ],
                ['Source', record.source],
                ['Workspace', area.label],
                ['Received', record.received + ' · ' + record.time],
                ...(area.path.includes('safety')
                  ? [['Review target', record.target] as const]
                  : []),
              ]}
            />
          </RecordSection>
        }
      >
        <RecordSection title="Record details">
          <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
            {record.title}
          </Typography>
          <Typography sx={{ mb: 3 }}>
            {area.path === '/businesses'
              ? 'A local studio would like to introduce its business to the Doji community.'
              : area.path === '/community-ideas'
                ? 'Share a small moment that made your day better.'
                : 'The submitted record and its supporting information are reviewed here before an outcome is recorded.'}
          </Typography>
          <Alert severity="info">
            Synthetic preview. No real evidence is loaded and no actions are available.
          </Alert>
        </RecordSection>
        <RecordSection title="Activity">
          <Typography color="text.secondary">No activity in this synthetic record.</Typography>
        </RecordSection>
      </RecordLayout>
    </>
  );
}
