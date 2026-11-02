import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import type { EmployeeHealth } from '@doji/portal-data/employee-health';
import { observation } from './OperationsTables';
const monitoringGaps = [
  ['Accounts & profiles', 'Sign-in, signup, session renewal and avatar-save success.'],
  ['Doji readiness', 'Required poll records and next scheduled Doji readiness.'],
  ['Answers & rewards', 'Confirmed submissions, failures and single-credit rewards.'],
  ['Feed & media', 'Feed display after submission, photo uploads and image display.'],
  [
    'Database & hosting',
    'Request outcomes, resource pressure and failure phases.',
  ],
  [
    'Email & phone delivery',
    'Recipient delivery outcomes; provider acceptance is not phone display.',
  ],
  [
    'Content cleanup',
    'Complete storage inventory, overdue cleanup and evidence-hold coverage.',
  ],
] as const;

export function OperationsSources({
  data,
  sentryProblem,
  failed,
  historyFailed,
  historyLoading,
  loading,
  historyCount,
}: {
  data: EmployeeHealth | undefined;
  sentryProblem: string | null;
  failed: boolean;
  historyFailed: boolean;
  historyLoading: boolean;
  loading: boolean;
  historyCount: number;
}) {
  const deliveryCurrent =
    !!data?.operational.available &&
    !!data.operational.checked_at &&
    Date.now() - Date.parse(data.operational.checked_at) <= 180000 &&
    Date.parse(data.operational.checked_at) <= Date.now() + 60000;
  const sources = [
    {
      name: 'Backend processing & cleanup',
      status: loading
        ? 'Checking'
        : failed || !data?.workflows
          ? 'Unavailable'
          : Date.now() - Date.parse(data.workflows.observed_at) > 180000 ||
              Date.parse(data.workflows.observed_at) > Date.now() + 60000
            ? 'Outdated'
            : data.workflows.enabled
              ? 'Current'
              : 'Observation disabled',
      detail: 'Attempts, failure phases and cleanup receipts—not member success rates.',
      observed: data?.workflows?.observed_at,
    },
    {
      name: 'Delivery & push',
      status: loading
        ? 'Checking'
        : failed
          ? 'Read failed'
          : deliveryCurrent
            ? 'Current'
            : data?.operational.checked_at
              ? 'Outdated'
              : 'Unavailable',
      detail: 'Publication latency, event backlog and push-processing failures.',
      observed: data?.operational.checked_at,
    },
    {
      name: 'Sentry app issues',
      status: loading ? 'Checking' : sentryProblem ? 'Needs attention' : 'Current',
      detail: sentryProblem ?? 'Unresolved issues in this environment from the last 24 hours.',
      observed: data?.sentry.observed_at,
    },
    {
      name: 'Doji delivery history',
      status: historyLoading
        ? 'Checking'
        : historyFailed
          ? 'Read failed'
          : historyCount
            ? `${historyCount} ${historyCount === 1 ? 'summary' : 'summaries'}`
            : 'No summaries',
      detail: 'Latest 12 summaries, including recovered delivery misses.',
      observed: undefined,
    },
    {
      name: 'Health-event availability',
      status:
        data?.health_events_enabled === true
          ? 'Enabled by server'
          : data?.health_events_enabled === false
            ? 'Not enabled'
            : 'Not verified',
      detail:
        'New observations refresh automatically when connected. The header shows connection status; observation times show data freshness.',
      observed: undefined,
    },
  ];
  return (
    <Stack sx={{ gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        {sources.map((source) => (
          <Paper key={source.name} variant="outlined" sx={{ p: 3 }}>
            <Stack
              direction="row"
              sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
            >
              <Typography component="h2" variant="h6">
                {source.name}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={source.status}
                color={
                  ['Needs attention', 'Read failed'].includes(source.status) ? 'warning' : 'default'
                }
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {source.detail}
            </Typography>
            {source.observed && (
              <Typography variant="caption" component="p" sx={{ mt: 2 }}>
                Observed {observation(source.observed)}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
      <Typography component="h2" variant="h6">
        Not yet verified by this screen
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        {monitoringGaps.map(([name, detail]) => (
          <Paper key={name} variant="outlined" sx={{ p: 2.5 }}>
            <Typography component="h3" variant="subtitle1">
              {name}
            </Typography>
            <Chip size="small" variant="outlined" label="Not measured" sx={{ my: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {detail}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        Delivery measures server publication, not phone display. Sentry shows up to 25 unresolved
        issues; counts may span their lifetime. Neither proves platform uptime or crash-free
        sessions. Missing readings stay unknown; readings expire after three minutes.
      </Typography>
    </Stack>
  );
}
