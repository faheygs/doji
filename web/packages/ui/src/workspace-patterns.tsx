'use client';

import { Box, Chip, Paper, TablePagination, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function QueuePagination({
  page,
  count,
  rowsPerPage,
  totalCount,
  state = 'ready',
  hasPrevious,
  hasNext,
  previous,
  next,
}: {
  page: number;
  count: number;
  rowsPerPage: number;
  totalCount?: number | undefined;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  hasPrevious: boolean;
  hasNext: boolean;
  previous: () => void;
  next: () => void;
}) {
  return (
    <TablePagination
      component="div"
      count={totalCount ?? -1}
      page={page - 1}
      rowsPerPage={rowsPerPage}
      rowsPerPageOptions={[]}
      onPageChange={(_, target) => {
        if (state === 'loading') return;
        if (target < page - 1 && hasPrevious) previous();
        if (state === 'ready' && target > page - 1 && hasNext) next();
      }}
      labelDisplayedRows={() => {
        if (state === 'loading') return 'Loading records…';
        if (state === 'error') return 'Records unavailable';
        if (!count || state === 'empty') return '0 records';
        const from = (page - 1) * rowsPerPage + 1;
        return `${from}–${from + count - 1}${totalCount === undefined ? '' : ` of ${totalCount}`}`;
      }}
      slotProps={{
        displayedRows: { role: 'status', 'aria-live': 'polite' },
        actions: {
          previousButton: { disabled: state === 'loading' || !hasPrevious },
          nextButton: { disabled: state !== 'ready' || !hasNext },
        },
      }}
    />
  );
}

export function WorkspaceCard({
  title,
  description,
  action,
  label,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  label?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {label && (
        <Chip
          size="small"
          variant="outlined"
          label={label}
          sx={{ alignSelf: 'flex-start', mb: 2 }}
        />
      )}
      <Typography component="h2" variant="h6">
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5, mb: 3, flex: 1 }}>
        {description}
      </Typography>
      {action && <Box>{action}</Box>}
    </Paper>
  );
}

export function RecordSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper component="section" variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography component="h2" variant="h6" sx={{ mb: 3 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
