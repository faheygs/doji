import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { services, statusColor, sampleObservedAt, type Scenario } from './model';

export function ServiceDetails({ scenario }: { scenario: Scenario }) {
  return (
    <Stack sx={{ gap: 1.5 }}>
      {services.map((service) => {
        const available = scenario === 'sample' && service.status !== 'Not measured';
        const label = available
          ? service.status
          : service.status === 'Not measured'
            ? 'Not measured'
            : scenario === 'stale'
              ? 'Stale'
              : 'Unknown';
        return (
          <Accordion
            key={service.id}
            disableGutters
            variant="outlined"
            sx={{ '&::before': { display: 'none' } }}
          >
            <AccordionSummary
              id={'service-' + service.id}
              aria-controls={'service-' + service.id + '-detail'}
              expandIcon={<span aria-hidden>⌄</span>}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ width: '100%', justifyContent: 'space-between', gap: 1, pr: 2 }}
              >
                <Box>
                  <Typography component="h3" variant="subtitle1">
                    {service.name}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    {available
                      ? service.summary
                      : service.status === 'Not measured'
                        ? service.summary
                        : 'No current verified reading'}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  variant="outlined"
                  label={label}
                  color={statusColor(label)}
                  sx={{ alignSelf: 'flex-start' }}
                />
              </Stack>
            </AccordionSummary>
            <AccordionDetails id={'service-' + service.id + '-detail'}>
              <Box
                component="dl"
                sx={{
                  m: 0,
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                  gap: 2,
                }}
              >
                <Box>
                  <Typography component="dt" variant="caption" color="text.secondary">
                    Source
                  </Typography>
                  <Typography component="dd" sx={{ m: 0 }}>
                    {service.source}
                  </Typography>
                </Box>
                <Box>
                  <Typography component="dt" variant="caption" color="text.secondary">
                    Observation
                  </Typography>
                  <Typography component="dd" sx={{ m: 0 }}>
                    {scenario === 'disconnected' || !service.metrics.length
                      ? 'Not available'
                      : sampleObservedAt + ' · synthetic'}
                  </Typography>
                </Box>
                {service.metrics.map(([label, value]) => (
                  <Box key={label}>
                    <Typography component="dt" variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography component="dd" sx={{ m: 0 }}>
                      {scenario === 'disconnected'
                        ? '—'
                        : value + (scenario === 'stale' ? ' · retained example' : ' · example')}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography variant="body2" sx={{ mt: 2 }}>
                {service.boundary}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {service.next}
              </Typography>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}
