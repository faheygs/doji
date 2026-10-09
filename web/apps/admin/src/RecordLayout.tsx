import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/** Read-only context is beside the record; command forms remain below both columns. */
export function RecordLayout({ children, summary }: { children: ReactNode; summary: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        mb: 3,
        alignItems: 'start',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 340px' },
      }}
    >
      <Stack sx={{ gap: 3, minWidth: 0 }}>{children}</Stack>
      <Stack
        component="aside"
        aria-label="Record summary"
        sx={{
          gap: 3,
          minWidth: 0,
          gridColumn: { lg: 2 },
          gridRow: { xs: 1, lg: 'auto' },
        }}
      >
        {summary}
      </Stack>
    </Box>
  );
}

export function RecordFields({
  rows,
  columns = 1,
}: {
  rows: ReadonlyArray<readonly [string, ReactNode]>;
  columns?: 1 | 2;
}) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gap: 2.5,
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        },
      }}
    >
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ minWidth: 0 }}>
          <Typography component="dt" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {label}
          </Typography>
          <Typography
            component="dd"
            sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {value === null || value === undefined || value === '' ? 'Not provided' : value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
