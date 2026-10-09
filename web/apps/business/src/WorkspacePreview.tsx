import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import {
  PageHeader,
  RecordSection,
  WorkspaceCard,
  WorkspaceShell,
  type WorkspaceDestination,
} from '@doji/ui';

const destinations: readonly WorkspaceDestination[] = [
  { path: '/preview/workspace', label: 'Overview', group: 'Business workspace' },
  {
    path: '/preview/workspace/application',
    label: 'Your application',
    group: 'Business workspace',
  },
  { path: '/preview/workspace/account', label: 'Account & security', group: 'Manage' },
  { path: '/preview/workspace/support', label: 'Help & support', group: 'Manage' },
];
export function WorkspacePreview() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const area = destinations.find((item) => item.path === pathname);
  return (
    <WorkspaceShell
      brand="Doji for Business"
      title={area?.label ?? 'Page not found'}
      activePath={pathname}
      destinations={destinations}
      navigate={navigate}
    >
      <Button component={Link} to="/" sx={{ mb: 2 }}>
        ← Business website
      </Button>
      <PageHeader
        title={
          area?.label === 'Overview'
            ? 'Your business, in one place.'
            : (area?.label ?? 'Page not found')
        }
        description="Workspace design preview. No account or application is connected."
      />
      {pathname === '/preview/workspace' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          <WorkspaceCard
            title="Your application"
            label="Status not connected"
            description="A persistent home for your submission, review status and any requested next steps."
            action={
              <Button component={Link} to="/preview/workspace/application" variant="outlined">
                View application layout
              </Button>
            }
          />
          <WorkspaceCard
            title="Account & security"
            description="Keep your business identity and security settings together, separate from your personal Doji account."
            action={
              <Button component={Link} to="/preview/workspace/account">
                View account layout →
              </Button>
            }
          />
          <WorkspaceCard
            title="Need a hand?"
            description="Find help without losing your place in the application."
            action={
              <Button component={Link} to="/preview/workspace/support">
                Get help →
              </Button>
            }
          />
        </Box>
      ) : area ? (
        <Stack sx={{ gap: 3 }}>
          <RecordSection title={area.label}>
            <Typography color="text.secondary">
              {area.label === 'Your application'
                ? 'Business details, the submission receipt and reviewer responses will share this page. Actual status is unavailable in the preview.'
                : area.label === 'Account & security'
                  ? 'Existing sign-in, verification and MFA contracts will be migrated here. This preview does not accept credentials.'
                  : 'Help should stay within reach throughout the business experience.'}
            </Typography>
          </RecordSection>
          {area.label === 'Help & support' && (
            <Button
              href="https://dojipro.com/support/"
              variant="outlined"
              sx={{ alignSelf: 'flex-start' }}
            >
              Visit existing support
            </Button>
          )}
        </Stack>
      ) : null}
      <Alert severity="info" sx={{ mt: 3 }}>
        Campaign publishing and billing remain disabled.
      </Alert>
    </WorkspaceShell>
  );
}
