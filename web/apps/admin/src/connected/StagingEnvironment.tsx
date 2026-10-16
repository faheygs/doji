import type { ReactNode } from 'react';
import { Box } from '@mui/material';

/** Environment identification only; grants and impersonation remain separate. */
export function StagingEnvironment({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        '& .MuiDrawer-docked .MuiDrawer-paper': { top: 32, height: 'calc(100% - 32px)' },
        '& .MuiAppBar-positionSticky': { top: 32 },
      }}
    >
      <Box
        role="note"
        aria-label="Staging environment"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: (theme) => theme.zIndex.drawer + 1,
          height: 32,
          typography: 'overline',
          lineHeight: '32px',
          fontWeight: 700,
          textAlign: 'center',
          bgcolor: '#fbc02d',
          color: '#000',
        }}
      >
        DOJI STAGE
      </Box>
      {children}
    </Box>
  );
}
