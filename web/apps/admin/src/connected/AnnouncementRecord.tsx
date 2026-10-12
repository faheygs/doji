import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Chip, Typography } from '@mui/material';
import { PageHeader, RecordSection, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import {
  announcementLabels,
  announcementFilters,
  lifecycleFilters,
  readAnnouncement,
} from '@doji/portal-data/announcements';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { RecordLayout } from '../RecordLayout';
import { AnnouncementActions } from './AnnouncementActions';
export function AnnouncementRecord({
  controller,
  id,
}: {
  controller: EmployeeSessionController;
  id: string;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params] = useSearchParams();
  const filter = (controller.historyReadsEnabled ? lifecycleFilters : announcementFilters).find(
    (value) => value === params.get('filter'),
  );
  const allowed = !!state.session && state.operator?.capabilities.operations_read === true;
  const query = useQuery({
    queryKey: state.session ? portalKey(state.session, 'announcements', { id }) : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readAnnouncement(controller, id, signal),
  });
  if (!allowed) return <Alert severity="error">Announcement access is unavailable.</Alert>;
  const item = query.isError ? undefined : query.data;
  return (
    <>
      <Button component={Link} to={'/announcements' + (filter ? '?filter=' + filter : '')}>
        Back to announcements
      </Button>
      {!item ? (
        <TableFrame
          label="announcement"
          state={query.isError ? 'error' : 'loading'}
          footer={null}
          errorAction={<Button onClick={() => void query.refetch()}>Retry announcement</Button>}
        />
      ) : (
        <>
          <PageHeader
            title={item.title}
            action={<Chip label={announcementLabels[item.status]} />}
          />
          <RecordLayout
            summary={
              <RecordSection title="Display settings">
                <Typography>Starts: {new Date(item.starts).toLocaleString()}</Typography>
                <Typography>
                  Ends: {item.ends ? new Date(item.ends).toLocaleString() : 'No end date'}
                </Typography>
                <Typography>
                  Up to {item.impressions} displays per eligible account, at least {item.spacing}{' '}
                  hours apart.
                </Typography>
                <Typography>Priority: {item.priority}</Typography>
                {item.ctaLabel && (
                  <Typography sx={{ overflowWrap: 'anywhere' }}>
                    Button: {item.ctaLabel} · {item.ctaUrl}
                  </Typography>
                )}
              </RecordSection>
            }
          >
            <RecordSection title="Message">
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {item.body}
              </Typography>
            </RecordSection>

            <Alert severity="info">
              {!item.managed
                ? 'Legacy announcement · read-only.'
                : !controller.announcementWritesEnabled
                  ? 'Read-only in this candidate.'
                  : ''}{' '}
              Status describes the display window, not confirmed member delivery. Member eligibility
              and dismissal rules still apply.
            </Alert>
            {controller.announcementWritesEnabled && (
              <AnnouncementActions controller={controller} item={item} />
            )}
          </RecordLayout>
        </>
      )}
    </>
  );
}
