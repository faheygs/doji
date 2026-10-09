import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import { portalKey } from '@doji/portal-data';
import { QueuePagination, RecordSection, TableFrame } from '@doji/ui';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { PrivacyRecord } from '@doji/portal-data/privacy-record';
import { applicationFields, readPrivacyAccess } from '@doji/portal-data/privacy-data';
export function PrivacyApplicationDetails({ details }: { details: Record<string, string> }) {
  return (
    <Box component="dl" sx={{ m: 0 }}>
      {applicationFields.map(([key, label]) => (
        <Box key={key} sx={{ mb: 2 }}>
          <Typography component="dt" color="text.secondary">
            {label}
          </Typography>
          <Typography
            component="dd"
            sx={{ m: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
          >
            {details[key] || 'Not recorded'}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
export function PrivacyAccess({
  controller,
  item,
}: {
  controller: EmployeeSessionController;
  item: PrivacyRecord;
}) {
  const [open, setOpen] = useState(false);
  return open ? (
    <ProtectedInformation controller={controller} item={item} hide={() => setOpen(false)} />
  ) : (
    <Button onClick={() => setOpen(true)}>Review protected application information</Button>
  );
}
function ProtectedInformation({
  controller,
  item,
  hide,
}: {
  controller: EmployeeSessionController;
  item: PrivacyRecord;
  hide: () => void;
}) {
  const state = controller.getSnapshot();
  const [cursors, setCursors] = useState([0]);
  const after = cursors.at(-1)!;
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'work', {
          privacy: 'access',
          id: item.id,
          revision: String(item.revision),
          after: String(after),
        })
      : ['denied'],
    enabled: !!state.session,
    gcTime: 0,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readPrivacyAccess(controller, item, after, signal),
  });
  const data = query.isError || query.isFetching ? undefined : query.data;
  return (
    <RecordSection title="Protected application information">
      <Stack sx={{ gap: 2 }}>
        <Button onClick={hide}>Hide protected information</Button>
        <Alert severity="info">
          Review scope and third-party information before secure delivery. This is not a full
          provider/support export; nothing is downloaded or sent.
        </Alert>
        {!data ? (
          <TableFrame
            label="protected application information"
            state={query.isError ? 'error' : 'loading'}
            footer={null}
            errorAction={
              <Button onClick={() => void query.refetch()}>Retry protected information</Button>
            }
          />
        ) : (
          <>
            {data.providerExportRequired && (
              <Alert severity="warning">
                WorkOS business identity: provider-held account information requires a separate
                protected export. Missing identity fields here do not mean that data was erased.
              </Alert>
            )}
            {data.identity && (
              <>
                <Typography>Name: {data.identity.name || 'Not retained'}</Typography>
                <Typography sx={{ overflowWrap: 'anywhere' }}>
                  Email: {data.identity.email || 'Not retained'}
                </Typography>
              </>
            )}
            <Typography>
              Signup agreement:{' '}
              {data.agreement
                ? `${data.agreement.terms} · ${data.agreement.privacy} · ${new Date(data.agreement.accepted).toLocaleString()}`
                : 'Not recorded'}
            </Typography>
            <Typography variant="h6">Current application</Typography>
            {data.application ? (
              <>
                <Typography>
                  {data.application.state.replaceAll('_', ' ')} · Revision{' '}
                  {data.application.revision}
                </Typography>
                <PrivacyApplicationDetails details={data.application.details} />
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                  Applicant response: {data.application.response || 'None'}
                </Typography>
              </>
            ) : (
              <Typography>No application recorded.</Typography>
            )}
            <Typography variant="h6">Submitted snapshots</Typography>
            {data.submissions.length ? (
              data.submissions.map((submission) => (
                <Accordion key={submission.number}>
                  <AccordionSummary>Submission {submission.number}</AccordionSummary>
                  <AccordionDetails>
                    <PrivacyApplicationDetails details={submission.details} />
                    <Typography>
                      {submission.terms} · {submission.privacy} ·{' '}
                      {new Date(submission.accepted).toLocaleString()}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              ))
            ) : (
              <Typography>No submitted snapshots.</Typography>
            )}
            <Typography variant="h6">Application history</Typography>
            {data.history.map((entry) => (
              <Box key={entry.revision}>
                <Typography>
                  {entry.action.replaceAll('_', ' ')} · Revision {entry.revision} ·{' '}
                  {new Date(entry.at).toLocaleString()}
                </Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {entry.response}
                </Typography>
              </Box>
            ))}
            {!data.history.length && <Typography>No history entries on this page.</Typography>}
            <QueuePagination
              page={cursors.length}
              count={data.history.length}
              rowsPerPage={30}
              state={data.history.length ? 'ready' : 'empty'}
              hasPrevious={cursors.length > 1}
              hasNext={data.next !== null}
              previous={() => setCursors(cursors.slice(0, -1))}
              next={() => {
                if (data.next !== null) setCursors([...cursors, data.next]);
              }}
            />
          </>
        )}
      </Stack>
    </RecordSection>
  );
}
