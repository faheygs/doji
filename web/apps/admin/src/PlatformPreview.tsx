import { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { PageHeader } from '@doji/ui';
import { HealthOverview } from './operations/HealthOverview';
import { HealthHistory } from './operations/HealthHistory';
import { ServiceDetails } from './operations/ServiceDetails';
import { sampleObservedAt, scenarioView, type Scenario } from './operations/model';

const sections = ['Overview', 'Services & coverage', 'App issues', 'Doji history'];
export function PlatformPreview() {
  const [scenario, setScenario] = useState<Scenario>('sample');
  const [tab, setTab] = useState(0);
  const view = scenarioView(scenario);
  return (
    <>
      <PageHeader
        title="Platform health"
        description="The operational picture: what needs attention, how delivery is performing, and what we can actually measure."
        action={<Chip variant="outlined" label="Preview · disconnected" />}
      />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ gap: 2, alignItems: { sm: 'center' }, mb: 3 }}
      >
        <Alert severity="info" sx={{ flex: 1 }}>
          Illustrative dashboard only. Every number and graph here is synthetic—not current platform
          telemetry.
        </Alert>
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <InputLabel id="health-scenario">Preview scenario</InputLabel>
          <Select
            labelId="health-scenario"
            label="Preview scenario"
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
          >
            <MenuItem value="sample">Illustrative incident</MenuItem>
            <MenuItem value="disconnected">Not connected</MenuItem>
            <MenuItem value="stale">Stale readings</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          borderLeft: 4,
          borderLeftColor: scenario === 'disconnected' ? 'divider' : 'warning.main',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ justifyContent: 'space-between', gap: 3 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              Operational summary
            </Typography>
            <Typography component="h2" variant="h3">
              {view.title}
            </Typography>
            <Typography sx={{ mt: 1, maxWidth: 760 }} color="text.secondary">
              {view.description}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 180 }}>
            <Chip label="Live updates not connected" variant="outlined" size="small" />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Observation: {view.hasSamples ? sampleObservedAt : 'Unavailable'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {scenario === 'stale'
                ? 'Retained sample · not current'
                : 'Fixed example · not a live timestamp'}
            </Typography>
          </Box>
        </Stack>
      </Paper>
      <Tabs
        value={tab}
        onChange={(_, value: number) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Platform health sections"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        {sections.map((section, index) => (
          <Tab
            key={section}
            label={section}
            id={'health-tab-' + index}
            aria-controls={'health-panel-' + index}
          />
        ))}
      </Tabs>
      {sections.map((section, index) => (
        <Box
          key={section}
          role="tabpanel"
          id={'health-panel-' + index}
          aria-labelledby={'health-tab-' + index}
          hidden={tab !== index}
          tabIndex={0}
        >
          {tab === index &&
            (index === 0 ? (
              <HealthOverview scenario={scenario} navigate={setTab} />
            ) : index === 1 ? (
              <ServiceDetails scenario={scenario} />
            ) : (
              <HealthHistory key={scenario + index} scenario={scenario} issues={index === 2} />
            ))}
        </Box>
      ))}
    </>
  );
}
