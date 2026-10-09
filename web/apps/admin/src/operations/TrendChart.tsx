import { lazy, Suspense, useId, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

const LineChart = lazy(() =>
  import('@mui/x-charts/LineChart').then((module) => ({ default: module.LineChart })),
);
type Point = { label: string; value: number | null };

/** Default Community chart; nullable readings remain gaps, never inferred zeros. */
export function TrendChart({
  title,
  unit,
  points,
  description,
}: {
  title: string;
  unit: string;
  points: readonly Point[];
  description: string;
}) {
  const id = useId();
  const [showValues, setShowValues] = useState(false);
  return (
    <Paper variant="outlined" component="section" aria-labelledby={id} sx={{ p: 2.5, minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Typography id={id} component="h2" variant="h6">
          {title}
        </Typography>
        <Button
          size="small"
          aria-expanded={showValues}
          aria-controls={id + '-values'}
          onClick={() => setShowValues(!showValues)}
        >
          {showValues ? 'Hide values' : 'View values'}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {description}
      </Typography>
      {points.length ? (
        <Suspense
          fallback={
            <Box role="status" sx={{ height: 300, display: 'grid', placeItems: 'center' }}>
              <CircularProgress aria-label={'Loading ' + title} />
            </Box>
          }
        >
          <Box role="group" aria-label={title} aria-describedby={id + '-description'}>
            <Typography id={id + '-description'} variant="caption" color="text.secondary">
              Missing observations are gaps. Exact values are available in the table.
            </Typography>
            <LineChart
              height={300}
              xAxis={[{ scaleType: 'point', data: points.map((point) => point.label) }]}
              yAxis={[
                {
                  min: 0,
                  max: points.every((point) => point.value === null || point.value === 0)
                    ? 1
                    : undefined,
                  tickMinStep: 1,
                  label: unit,
                },
              ]}
              series={[
                {
                  id: 'observations',
                  label: unit,
                  data: points.map((point) => point.value),
                  curve: 'linear',
                  connectNulls: false,
                  showMark: true,
                },
              ]}
            />
          </Box>
        </Suspense>
      ) : (
        <Box sx={{ height: 300, display: 'grid', placeItems: 'center' }}>
          <Typography color="text.secondary">No historical samples connected</Typography>
        </Box>
      )}
      <TableContainer id={id + '-values'} hidden={!showValues}>
        <Table size="small" aria-label={title + ' values'}>
          <TableHead>
            <TableRow>
              <TableCell scope="col">Doji date</TableCell>
              <TableCell scope="col" align="right">
                {unit}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {points.map((point) => (
              <TableRow key={point.label}>
                <TableCell component="th" scope="row">
                  {point.label}
                </TableCell>
                <TableCell align="right">{point.value ?? 'Not measured'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary">
        Per-Doji observations · not a continuous uptime series
      </Typography>
    </Paper>
  );
}
