'use client';

import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { MomentPreview } from './MomentPreview';

export function MarketingHero({
  eyebrow,
  title,
  description,
  actions,
  business = false,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  actions: ReactNode;
  business?: boolean;
}) {
  return (
    <Box
      component="section"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.3fr) minmax(0, 1fr)' },
        alignItems: 'center',
        gap: { xs: 4, md: 7 },
        py: { xs: 6, md: 10 },
      }}
    >
      <Box>
        <Typography variant="overline" color="primary">
          {eyebrow}
        </Typography>
        <Typography
          component="h1"
          variant="h1"
          sx={{ mt: 2, fontSize: { xs: '2.9rem', sm: '3.8rem', lg: '4.4rem' }, lineHeight: 1.04 }}
        >
          {title}
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mt: 3, maxWidth: 620, fontSize: '1.125rem', lineHeight: 1.7 }}
        >
          {description}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ mt: 4, gap: 2 }}>
          {actions}
        </Stack>
      </Box>
      <MomentPreview business={business} />
    </Box>
  );
}
