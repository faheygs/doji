import { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { QueuePagination, RecordSection, TableFrame } from '@doji/ui';
import type { ModerationRecord } from '@doji/portal-data/moderation-record';
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Time not recorded';
const label = (value: string) => value.replaceAll(/[._]/g, ' ');
export function ModerationHistory({ item }: { item: ModerationRecord }) {
  return (
    <Accordion slotProps={{ transition: { unmountOnExit: true } }}>
      <AccordionSummary aria-controls="moderation-history-content" id="moderation-history-toggle">
        Case history
      </AccordionSummary>
      <AccordionDetails id="moderation-history-content">
        <HistoryContents
          key={JSON.stringify([
            item.report.history.workflow,
            item.appeal?.history,
            item.appeal?.appeal,
          ])}
          item={item}
        />
      </AccordionDetails>
    </Accordion>
  );
}
function HistoryContents({ item }: { item: ModerationRecord }) {
  const [page, setPage] = useState(1);
  const { workflow, access } = item.report.history;
  const rows = [...(workflow ?? [])].sort(
    (a, b) => (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0),
  );
  const visible = rows.slice((page - 1) * 10, page * 10);
  const appeal = item.appeal;
  return (
    <Stack sx={{ gap: 3 }}>
      {appeal && (
        <RecordSection title="Appeal history">
          <Stack component="ol" sx={{ gap: 2, pl: 3 }}>
            <li>
              <Typography>Original decision recorded</Typography>
              <Typography color="text.secondary">
                {time(appeal.history.decidedAt)} · {appeal.history.originalReviewer}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {appeal.original.rationale || 'Rationale unavailable'}
              </Typography>
            </li>
            <li>
              <Typography>Appeal submitted</Typography>
              <Typography color="text.secondary">{time(appeal.history.submittedAt)}</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {appeal.appeal.statement || 'Statement unavailable'}
              </Typography>
            </li>
            {(appeal.appeal.status !== 'pending' || appeal.history.reviewedAt) && (
              <li>
                <Typography>Appeal {label(appeal.appeal.status) || 'review recorded'}</Typography>
                <Typography color="text.secondary">
                  {time(appeal.history.reviewedAt)} · {appeal.history.reviewer}
                </Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {appeal.appeal.review_reason || 'Review reason unavailable'}
                </Typography>
              </li>
            )}
          </Stack>
        </RecordSection>
      )}
      <Typography variant="h6" component="h2">
        {appeal ? 'Linked report workflow' : 'Report workflow'}
      </Typography>
      {workflow === null ? (
        <Alert severity="info">Workflow history is unavailable in this response.</Alert>
      ) : (
        <>
          {workflow.length === 50 && (
            <Alert severity="info">
              Latest 50 workflow entries. Earlier activity may remain in the audit log.
            </Alert>
          )}
          <TableFrame
            label="report workflow history"
            state={rows.length ? 'ready' : 'empty'}
            emptyMessage="No workflow entries returned."
            footer={
              <QueuePagination
                page={page}
                count={visible.length}
                totalCount={rows.length}
                rowsPerPage={10}
                hasPrevious={page > 1}
                hasNext={page * 10 < rows.length}
                previous={() => setPage(page - 1)}
                next={() => setPage(page + 1)}
              />
            }
          >
            <Table stickyHeader aria-label="Report workflow history" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  {['Activity', 'Reviewer', 'Time', 'Details'].map((title) => (
                    <TableCell key={title}>{title}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell>{label(entry.action)}</TableCell>
                    <TableCell>
                      {entry.actor}
                      {entry.role && (
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {label(entry.role)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{time(entry.at)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {entry.reason || 'No note recorded'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </>
      )}
      <RecordSection title="Evidence access">
        {access ? (
          <>
            <Typography>{access.count} recorded evidence views</Typography>
            {access.count > 0 && (
              <Typography>
                Last view: {time(access.at)} · {access.actor}
              </Typography>
            )}
          </>
        ) : (
          <Typography>Evidence-access summary unavailable.</Typography>
        )}
        <Typography color="text.secondary">
          Evidence views are separate from workflow activity. Detailed access records remain in the
          audit log.
        </Typography>
      </RecordSection>
    </Stack>
  );
}
