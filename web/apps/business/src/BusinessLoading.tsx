import { CircularProgress, Stack, Typography } from '@mui/material';
export function Loading() {
  return (
    <Stack
      role="status"
      aria-live="polite"
      sx={{ minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 2 }}
    >
      <CircularProgress />
      <Typography>Opening your business account…</Typography>
    </Stack>
  );
}
