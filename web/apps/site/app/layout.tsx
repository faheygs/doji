import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { DojiTheme } from '@doji/ui/theme';
import { BrandLockup } from '@doji/ui';
import { Box, Button, Container, Link, Stack, Typography } from '@mui/material';

export const metadata: Metadata = {
  metadataBase: new URL('https://dojipro.com'),
  title: {
    default: 'Doji — One daily challenge. Ten minutes. Everyone in.',
    template: '%s | Doji',
  },
  description:
    'Doji is a realtime social daily-challenge app. Show up, make your move, and see what your friends did.',
  alternates: { canonical: '/' },
  // Preview must not be indexed; release gate changes this alongside the complete route map.
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          <DojiTheme>
            <Box
              component="a"
              href="#main"
              sx={{
                position: 'absolute',
                left: -10000,
                '&:focus': { left: 16, top: 8, zIndex: 1500, bgcolor: 'background.paper', p: 1 },
              }}
            >
              Skip to content
            </Box>
            <Container maxWidth="lg">
              <Stack
                component="nav"
                aria-label="Primary"
                direction="row"
                sx={{
                  py: 3,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Link href="/" color="text.primary" underline="none" variant="h6">
                  <BrandLockup />
                </Link>
                <Stack direction="row" sx={{ gap: 1 }}>
                  <Button href="#how">How it works</Button>
                  <Button href="https://business.dojipro.com/">For business</Button>
                  <Button href="https://dojipro.com/support/">Support</Button>
                </Stack>
              </Stack>
              <Box component="main" id="main">
                {children}
              </Box>
              <Stack
                component="footer"
                direction="row"
                sx={{
                  py: 4,
                  borderTop: 1,
                  borderColor: 'divider',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 3,
                }}
              >
                <Typography variant="body2">© 2026 Doji. Built for shared moments.</Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
                  {['privacy', 'terms', 'community-guidelines', 'support'].map((path) => (
                    <Link key={path} href={'https://dojipro.com/' + path + '/'}>
                      {path.replaceAll('-', ' ')}
                    </Link>
                  ))}
                </Stack>
              </Stack>
            </Container>
          </DojiTheme>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
