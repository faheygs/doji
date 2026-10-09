import { lazy, Suspense } from 'react';
import { Link as RouterLink, Route, Routes, useLocation } from 'react-router-dom';
import { Alert, Box, Button, Container, Link, Paper, Stack, Typography } from '@mui/material';
import { BrandLockup, MarketingHero, PageHeader, PreviewNotice, TableFrame } from '@doji/ui';

const WorkspacePreview = lazy(() =>
  import('./WorkspacePreview').then((m) => ({ default: m.WorkspacePreview })),
);

function Home() {
  return (
    <>
      <MarketingHero
        business
        eyebrow="Doji for Business"
        title="Be part of the moment."
        description="Doji brings people together around one daily challenge. Introduce your business and explore a more participatory way to connect."
        actions={
          <>
            <Button
              component={RouterLink}
              to="/business-portal/access/?mode=register"
              variant="contained"
              size="large"
            >
              Register your business
            </Button>
            <Button href="#how" variant="outlined" size="large">
              How it works
            </Button>
          </>
        }
      />
      <Box component="section" id="how" sx={{ py: 4 }}>
        <Typography variant="h2" component="h2" sx={{ mb: 3 }}>
          A simple start. A thoughtful review.
        </Typography>
        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}
        >
          {[
            [
              'Create your account',
              'Register and verify your email. Your business account is separate from your personal Doji account.',
            ],
            [
              'Introduce your business',
              'Add your business and representative details. Save your progress, then submit when you are ready.',
            ],
            [
              'Follow your review',
              'Return to see your status and respond to requests for changes. Workspace access follows approval and requires an authenticator.',
            ],
          ].map(([title, body]) => (
            <Paper key={title} variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h5" component="h3">
                {title}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 2, lineHeight: 1.7 }}>
                {body}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>
      <Alert severity="info" sx={{ my: 4 }}>
        Campaign publishing and billing remain closed. Registration does not authorize a charge.
      </Alert>
    </>
  );
}
function Access() {
  return (
    <Box sx={{ py: 6 }}>
      <PageHeader
        title="Business access"
        description="Authentication is not connected in this migration preview."
      />
      <Alert severity="info">
        The existing business sign-in, registration and application remain unchanged. This preview
        does not accept credentials.
      </Alert>
      <Button component={RouterLink} to="/" sx={{ mt: 3 }}>
        Back to Doji for Business
      </Button>
    </Box>
  );
}
export function App() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/preview/workspace'))
    return (
      <Suspense fallback={<TableFrame label="workspace" state="loading" footer={null} />}>
        <WorkspacePreview />
      </Suspense>
    );
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack
        component="nav"
        aria-label="Primary"
        direction="row"
        sx={{
          mb: 3,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Link component={RouterLink} to="/" underline="none" color="text.primary" variant="h6">
          <BrandLockup label="Doji for Business" />
        </Link>
        <Stack direction="row" sx={{ gap: 1 }}>
          <Button component={RouterLink} to="/business-portal/access/?mode=signin">
            Sign in
          </Button>
          <Button
            component={RouterLink}
            to="/business-portal/access/?mode=register"
            variant="contained"
          >
            Register
          </Button>
        </Stack>
      </Stack>
      <PreviewNotice />
      <Button component={RouterLink} to="/preview/workspace" sx={{ mt: 2 }}>
        Explore workspace design →
      </Button>
      <Box component="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/business-portal/access/" element={<Access />} />
          <Route path="*" element={<PageHeader title="Page not migrated yet" />} />
        </Routes>
      </Box>
      <Stack
        component="footer"
        direction="row"
        sx={{ py: 4, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap', gap: 3 }}
      >
        <Link href="https://dojipro.com/">Doji app</Link>
        <Link href="https://business.dojipro.com/business-terms/">Business terms</Link>
        <Link href="https://business.dojipro.com/business-privacy/">Privacy</Link>
        <Link href="https://dojipro.com/support/">Support</Link>
      </Stack>
    </Container>
  );
}
