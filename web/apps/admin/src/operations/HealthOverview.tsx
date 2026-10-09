import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { TrendChart } from './TrendChart';
import { history, scenarioView, type Scenario } from './model';

export function HealthOverview({
  scenario,
  navigate,
}: {
  scenario: Scenario;
  navigate: (tab: number) => void;
}) {
  const { hasSamples } = scenarioView(scenario);
  const current = scenario === 'sample';
  const points = hasSamples ? history : [];
  return (
    <Stack sx={{ gap: 3 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        {[
          ['Delivery p95', '620 ms', '64 samples · last 5 minutes'],
          ['Overdue events', '0', 'Shared realtime outbox'],
          ['Stale push shards', '0', 'Does not measure phone display'],
          ['App issue groups', '2', 'Bounded unresolved query · 24h'],
        ].map(([label, value, note]) => (
          <Paper key={label} variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h4" sx={{ my: 1 }}>
              {current ? value : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {current
                ? note
                : scenario === 'stale'
                  ? 'Current reading unavailable'
                  : 'Not connected'}
            </Typography>
          </Paper>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        <TrendChart
          title="Delivery latency by Doji"
          unit="ms"
          points={points.map((row) => ({ label: row.day, value: row.p95 }))}
          description="p95 server publication latency · synthetic history"
        />
        <TrendChart
          title="Unpublished events by Doji"
          unit="events"
          points={points.map((row) => ({ label: row.day, value: row.overdue }))}
          description="Unpublished events at the recorded observation · synthetic history"
        />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6">
            Needs attention
          </Typography>
          <Stack sx={{ gap: 2, mt: 2 }}>
            <Box>
              <Chip
                label={current ? 'Example · Watch' : 'Visibility gap'}
                size="small"
                color="warning"
                variant="outlined"
              />
              <Typography sx={{ mt: 1 }}>
                {current
                  ? 'Two app issues deserve investigation, not an automatic outage declaration.'
                  : 'Current incidents cannot be assessed without fresh readings.'}
              </Typography>
            </Box>
            <Button variant="outlined" onClick={() => navigate(2)}>
              Inspect app issues
            </Button>
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h6">
            Monitoring coverage
          </Typography>
          <Typography sx={{ mt: 2 }}>
            Delivery, push and Doji summaries have existing read contracts. API success,
            authentication, hosting, storage and email need qualified aggregate signals.
          </Typography>
          <Button variant="outlined" onClick={() => navigate(1)} sx={{ mt: 2 }}>
            Inspect services & coverage
          </Button>
        </Paper>
      </Box>
    </Stack>
  );
}
