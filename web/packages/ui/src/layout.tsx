'use client';

import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  TableContainer,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';

export function PreviewNotice() {
  return (
    <Alert severity="info">
      Migration preview — not connected to production. No changes are saved or sent.
    </Alert>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      sx={{ mb: 3, justifyContent: 'space-between', gap: 2 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h1" variant="h4">
          {title}
        </Typography>
        {description && (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {description}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>{action}</Box>}
    </Stack>
  );
}

type TableFrameProps = {
  label: string;
  state: 'ready' | 'loading' | 'empty' | 'error';
  toolbar?: ReactNode;
  footer: ReactNode;
  children?: ReactNode;
  emptyMessage?: string;
  errorMessage?: string;
  errorAction?: ReactNode;
};
/** The body scrolls, never the footer. All states reserve the same space. */
export function TableFrame({
  label,
  state,
  toolbar,
  footer,
  children,
  emptyMessage = 'No records found.',
  errorMessage = 'Unable to load records.',
  errorAction,
}: TableFrameProps) {
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label={label}
      sx={{
        height: 'clamp(28rem, 65dvh, 48rem)',
        width: '100%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {toolbar && (
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTextField-root': { minWidth: { xs: '100%', sm: 220 } },
          }}
        >
          {toolbar}
        </Box>
      )}
      <TableContainer
        role="region"
        aria-label={label + ' table contents'}
        tabIndex={state === 'ready' ? 0 : undefined}
        aria-busy={state === 'loading'}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}
      >
        {state === 'ready' ? (
          children
        ) : (
          <Stack
            role={state === 'error' ? 'alert' : 'status'}
            sx={{
              height: '100%',
              p: 3,
              textAlign: 'center',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            {state === 'loading' && <CircularProgress size={32} aria-label={`Loading ${label}`} />}
            <Typography color="text.secondary">
              {state === 'loading'
                ? `Loading ${label}…`
                : state === 'empty'
                  ? emptyMessage
                  : errorMessage}
            </Typography>
            {state === 'error' && errorAction}
          </Stack>
        )}
      </TableContainer>
      <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', px: 2, py: 1 }}>{footer}</Box>
    </Paper>
  );
}
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <Paper
      component="footer"
      square
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        pb: 'max(16px, env(safe-area-inset-bottom))',
      }}
    >
      <Stack direction="row" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1.5 }}>
        {children}
      </Stack>
    </Paper>
  );
}
