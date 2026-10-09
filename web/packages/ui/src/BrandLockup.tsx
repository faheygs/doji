'use client';

import { Box, Stack, Typography } from '@mui/material';

export function BrandLockup({ label = 'Doji' }: { label?: string }) {
  return (
    <Stack component="span" direction="row" sx={{ alignItems: 'center', gap: 1 }}>
      <Box
        component="img"
        src="/doji-icon.png"
        alt=""
        width={40}
        height={40}
        sx={{ borderRadius: 1 }}
      />
      <Typography component="span" variant="h6">
        {label}
      </Typography>
    </Stack>
  );
}
