import { useState } from 'react';
import { Alert, Box, Tab, Tabs } from '@mui/material';
import { OwnedBusinessAccess, type AccessStep } from './OwnedBusinessAccess';
import { AccountCard } from '@doji/ui';
import { Button, Stack } from '@mui/material';
const steps: AccessStep[] = [
  'signin',
  'register',
  'verify',
  'recover',
  'check-email',
  'reset',
  'reset-done',
  'mfa',
];
/** Local-only illustration. No fetch, provider calls, accounts or emails. */
export function AccessPreview() {
  const [view, setView] = useState<AccessStep | 'closed'>('signin');
  return (
    <Box>
      <Alert severity="info">
        Design preview only. Use sample values—no accounts are created and no emails are sent.
      </Alert>
      <Tabs
        value={view}
        onChange={(_, next: AccessStep | 'closed') => setView(next)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Account screen preview"
      >
        {steps.map((step) => (
          <Tab key={step} value={step} label={step.replaceAll('-', ' ')} />
        ))}
        <Tab value="closed" label="Registration closed" />
      </Tabs>
      {view === 'closed' ? (
        <AccountCard
          title="Business registration is currently closed"
          description="Existing business accounts can still sign in. Contact us if you’d like to introduce your business."
        >
          <Stack direction="row" sx={{ justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={() => setView('signin')}>
              Sign in
            </Button>
            <Button href="mailto:support@dojipro.com">Contact Doji</Button>
          </Stack>
        </AccountCard>
      ) : (
        <OwnedBusinessAccess
          key={view}
          initialStep={view}
          transport={async (action) => ({
            step:
              action === 'recover'
                ? 'check-email'
                : action === 'reset'
                  ? 'reset-done'
                  : action === 'register'
                    ? 'verify'
                    : 'complete',
          })}
          onAuthenticated={() => setView('signin')}
        />
      )}
    </Box>
  );
}
