'use client';

import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/** One bounded, centered account surface. Layout only; MUI owns control styling. */
export function AccountCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        width: '100%',
        display: 'grid',
        placeItems: 'center',
        py: { xs: 3, md: 5 },
        minHeight: '60vh',
      }}
    >
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 520, p: { xs: 3, sm: 4 } }}>
        <Stack spacing={3}>
          <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Box component="img" src="/doji-icon.png" alt="" width={48} height={48} />
            <Typography variant="overline" color="primary">
              Doji for Business
            </Typography>
            <Typography component="h1" variant="h4">
              {title}
            </Typography>
            <Typography color="text.secondary">{description}</Typography>
          </Stack>
          {children}
        </Stack>
      </Paper>
    </Box>
  );
}
