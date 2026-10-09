import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { PageHeader, RecordSection, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import { applicationFields, readBusinessRecord } from '@doji/portal-data/business-record';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { RecordLayout, RecordFields } from '../RecordLayout';
import { useBusinessClaim } from './useBusinessClaim';
import { BusinessReview } from './BusinessReview';
import { BusinessOwnershipActions } from './BusinessOwnershipActions';

export function BusinessRecord({
  controller,
  id,
}: {
  controller: EmployeeSessionController;
  id: string;
}) {
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const allowed = session.operator?.capabilities.business_read === true && !!session.session;
  const query = useQuery({
    queryKey: session.session
      ? portalKey(session.session, 'work', { record: 'business_application', id })
      : ['denied'],
    enabled: allowed,
    // A command can finish after leaving this page. Reconcile ownership on every entry.
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readBusinessRecord(controller, id, signal),
  });
  const claim = useBusinessClaim(controller, id);
  const refresh = async () => {
    const result = await query.refetch();
    if (!result.isError) claim.refreshed(result.data);
    return result.isError ? undefined : result.data;
  };
  const back = (
    <Button component={Link} to="/businesses">
      ← Business applications
    </Button>
  );
  if (!allowed) return <Alert severity="error">Business access is unavailable.</Alert>;
  if (query.isPending || query.isError || !query.data)
    return (
      <>
        {back}
        <PageHeader title="Business application" />
        <TableFrame
          label="business application"
          state={query.isError ? 'error' : 'loading'}
          footer={null}
          errorAction={<Button onClick={() => void refresh()}>Retry record read</Button>}
        />
      </>
    );
  const { application: item, owner } = query.data;
  return (
    <>
      {back}
      <PageHeader
        title={item.details.brand_name || 'Business application'}
        description={'Application ' + item.id}
        action={<Chip label={item.state.replaceAll('_', ' ')} variant="outlined" />}
      />
      {claim.message && (
        <Alert severity={claim.uncertain || claim.blocked ? 'warning' : 'success'} sx={{ mb: 2 }}>
          {claim.message}
        </Alert>
      )}
      <RecordLayout
        summary={
          <>
            <RecordSection title="At a glance">
              <Box
                component="dl"
                sx={{
                  m: 0,
                  '& dt': { color: 'text.secondary', mb: 0.5 },
                  '& dd': { m: 0, mb: 2, overflowWrap: 'anywhere' },
                }}
              >
                <dt>Assignee</dt>
                <dd>
                  {owner.assigned_to === session.operator?.user_id
                    ? owner.owner_label + ' (you)'
                    : owner.owner_label}
                </dd>
                <dt>Submission</dt>
                <dd>{item.submission}</dd>
                <dt>Revision</dt>
                <dd>{item.revision}</dd>
                <dt>Terms version</dt>
                <dd>{item.terms}</dd>
                <dt>Privacy version</dt>
                <dd>{item.privacy}</dd>
              </Box>
            </RecordSection>
            <Alert severity="info">
              Approval grants workspace access only. Billing and campaign publishing remain
              disabled. Assignment changes coordinate staff review and do not notify the applicant.
            </Alert>
          </>
        }
      >
        <RecordSection title="Submitted application">
          <RecordFields
            columns={2}
            rows={applicationFields.map(
              ([field, label]) => [label, item.details[field] || 'Not provided'] as const,
            )}
          />
        </RecordSection>
        <RecordSection title="Review history">
          {!item.history.length && <Typography>No review history recorded.</Typography>}
          <Stack sx={{ gap: 3 }}>
            {item.history.map((entry) => (
              <Box key={entry.revision} sx={{ overflowWrap: 'anywhere' }}>
                <Typography component="h3" variant="subtitle1">
                  {entry.action.replaceAll('_', ' ')} · revision {entry.revision}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(entry.occurred_at).toLocaleString()}
                </Typography>
                {entry.response && (
                  <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                    Applicant response: {entry.response}
                  </Typography>
                )}
                {entry.internal_note && (
                  <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                    Internal note: {entry.internal_note}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
          {item.historyHasMore && (
            <Typography sx={{ mt: 2 }} color="text.secondary">
              Most recent 30 entries. Older history is retained; extended history navigation is not
              connected yet.
            </Typography>
          )}
        </RecordSection>
      </RecordLayout>
      <BusinessReview
        controller={controller}
        data={query.data}
        operator={session.operator!}
        fetching={query.isFetching}
        claimBusy={claim.busy}
        ownershipBlocked={claim.uncertain || claim.blocked}
        refresh={refresh}
      >
        {(disabled) => (
          <BusinessOwnershipActions
            controller={controller}
            data={query.data!}
            claim={claim}
            disabled={disabled || query.isFetching}
            refresh={refresh}
          />
        )}
      </BusinessReview>
    </>
  );
}
