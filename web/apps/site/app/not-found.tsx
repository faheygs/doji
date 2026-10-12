import { Button, Stack, Typography } from '@mui/material';
export default function NotFound() {
  return (
    <Stack spacing={3} sx={{ py: 10 }}>
      <Typography variant="h2" component="h1">
        Page not found
      </Typography>
      <Typography>This page may have moved. Head back to Doji or contact support.</Typography>
      <Stack direction="row" spacing={2}>
        <Button href="/" variant="contained">
          Back to Doji
        </Button>
        <Button href="/support/">Get support</Button>
      </Stack>
    </Stack>
  );
}
