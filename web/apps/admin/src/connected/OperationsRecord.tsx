import { useState } from 'react';
import { Alert, Box, Chip, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { PageHeader, TableFrame } from '@doji/ui';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { useEmployeeHealth } from './useEmployeeHealth';
import { OperationsHistory, OperationsIssues, healthColor, observation } from './OperationsTables';
import { TrendChart } from '../operations/TrendChart';

const sections = ['Overview', 'Services & coverage', 'App issues', 'Doji history'];
export function OperationsRecord({ controller }: { controller: EmployeeSessionController }) {
  const [tab, setTab] = useState(0);
  const { snapshot, history, data, rows, assessment } = useEmployeeHealth(controller);
  const issuesCurrent =
    assessment.signals.find((x) => x.name.startsWith('App errors'))?.state !== 'unknown';
  const chronological = [...rows].sort(
    (a, b) => Date.parse(a.fires_at ?? '') - Date.parse(b.fires_at ?? ''),
  );
  const points = (field: 'realtime_p95_ms' | 'outbox_unpublished') =>
    chronological.map((row, index) => ({
      label: `${index + 1} · ${row.fires_at ? new Date(row.fires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Unknown date'}`,
      value: row[field],
    }));
  return (
    <>
      <PageHeader
        title="Platform health"
        description="Operational readings, app issues and recent Doji delivery."
        action={
          <Chip label={assessment.label} color={healthColor(assessment.state)} variant="outlined" />
        }
      />
      <Alert severity="info" sx={{ mb: 3 }}>
        Health push updates are not enabled. Readings reconcile when you return or reconnect; the
        queue connection is not a live health feed.
      </Alert>
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography component="h2" variant="h3">
          {assessment.title}
        </Typography>
        <Typography sx={{ my: 1 }}>{assessment.summary}</Typography>
        <Chip size="small" variant="outlined" label={assessment.coverageLabel} />
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          Delivery observation: {observation(data?.operational.checked_at)} · App-error observation:{' '}
          {observation(data?.sentry.observed_at)}
        </Typography>
        {(snapshot.isFetching || history.isFetching) && (
          <Typography role="status" variant="caption">
            Updating authorized readings…
          </Typography>
        )}
      </Paper>
      <Tabs
        value={tab}
        onChange={(_, value: number) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Platform health sections"
        sx={{ mb: 3 }}
      >
        {sections.map((label, index) => (
          <Tab
            key={label}
            label={label}
            id={'operations-tab-' + index}
            aria-controls={'operations-panel-' + index}
          />
        ))}
      </Tabs>
      {sections.map((section, index) => (
        <Box
          key={section}
          role="tabpanel"
          hidden={tab !== index}
          id={'operations-panel-' + index}
          aria-labelledby={'operations-tab-' + index}
          tabIndex={0}
        >
          {tab === index &&
            (index === 0 ? (
              <Stack sx={{ gap: 3 }}>
                {snapshot.isPending ? (
                  <TableFrame label="operational readings" state="loading" footer={null} />
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: 'repeat(3, 1fr)' },
                      gap: 2,
                    }}
                  >
                    {assessment.signals.map((signal) => (
                      <Paper variant="outlined" key={signal.name} sx={{ p: 2.5 }}>
                        <Typography component="h3" variant="subtitle1">
                          {signal.name}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={signal.label}
                          color={healthColor(signal.state)}
                          sx={{ my: 1 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {signal.detail}
                        </Typography>
                      </Paper>
                    ))}
                  </Box>
                )}
                {history.isPending ? (
                  <TableFrame label="delivery trends" state="loading" footer={null} />
                ) : history.isError ? (
                  <Alert severity="error">
                    Delivery history is unavailable; graphs cannot be assessed.
                  </Alert>
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                      gap: 2,
                    }}
                  >
                    <TrendChart
                      title="Delivery latency by Doji"
                      unit="ms"
                      points={points('realtime_p95_ms')}
                      description="Archived p95 server publication latency. Missing measurements stay visible."
                    />
                    <TrendChart
                      title="Unpublished events by Doji"
                      unit="events"
                      points={points('outbox_unpublished')}
                      description="Unpublished at the recorded observation, not a current backlog measurement."
                    />
                  </Box>
                )}
              </Stack>
            ) : index === 1 ? (
              <Stack sx={{ gap: 2 }}>
                <Alert severity="warning">
                  These readings do not establish whole-platform uptime or crash-free sessions.
                </Alert>
                {[
                  [
                    'Delivery and push',
                    'Existing server snapshots cover publication latency, outbox backlog, push fanout and APNs credential failures. They do not prove notification display on a device.',
                  ],
                  [
                    'App errors',
                    'The authorized Sentry read returns at most 25 unresolved production issue groups over 24 hours. Resolved and unreported failures, recovery and feature success rates are not measured here.',
                  ],
                  [
                    'Doji history',
                    'The latest 12 archived summaries retain missed delivery targets after recovery. Unfinalized summaries are still settling; absence is not an all-clear.',
                  ],
                  [
                    'Coverage gaps',
                    'API success rates, authentication continuity, hosting, storage and email delivery have no qualified aggregate signal in this screen.',
                  ],
                  [
                    'Freshness',
                    'Delivery and app-error observations expire after three minutes. Expiry changes the labels locally without polling; foreground and reconnect use existing authorized reads.',
                  ],
                ].map(([title, description]) => (
                  <Paper key={title} variant="outlined" sx={{ p: 3 }}>
                    <Typography component="h2" variant="h3">
                      {title}
                    </Typography>
                    <Typography sx={{ mt: 1 }}>{description}</Typography>
                  </Paper>
                ))}
              </Stack>
            ) : index === 2 ? (
              <OperationsIssues
                data={data?.sentry.issues ?? []}
                loading={snapshot.isPending}
                failed={snapshot.isError}
                available={issuesCurrent}
              />
            ) : (
              <OperationsHistory data={rows} loading={history.isPending} failed={history.isError} />
            ))}
        </Box>
      ))}
    </>
  );
}
