'use client';

import { alpha, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import type { PropsWithChildren } from 'react';

/** Brand tokens are shared; MUI retains component structure and interaction behavior. */
export function createDojiTheme(mode: 'light' | 'dark', desktopWorkspace = false) {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#ff9878' : '#b83b1b', contrastText: dark ? '#101114' : '#ffffff' },
      secondary: { main: dark ? '#bba5ff' : '#6744c4', dark: '#6744c4' },
      background: { default: dark ? '#101114' : '#fbfaf8', paper: dark ? '#1a1b20' : '#ffffff' },
      text: { primary: dark ? '#f7f5f2' : '#101114', secondary: dark ? '#b6b5bd' : '#62616b' },
      divider: dark ? '#35343e' : '#e7e3df',
    },
    typography: {
      fontSize: 14,
      fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1: { fontWeight: 800, letterSpacing: '-0.045em' },
      h2: { fontWeight: 750, letterSpacing: '-0.035em', fontSize: '2.5rem' },
      h3: { fontWeight: 750, letterSpacing: '-0.025em' },
      h4: {
        fontWeight: 700,
        letterSpacing: '-0.02em',
        ...(desktopWorkspace ? { fontSize: '1.875rem' } : {}),
      },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 600 },
      overline: { fontWeight: 700, letterSpacing: '0.1em' },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontSize: 12,
            fontWeight: 700,
            color: dark ? '#b6b5bd' : '#62616b',
            backgroundColor: dark ? '#202127' : '#f4f2ef',
            whiteSpace: 'nowrap',
          },
          body: { fontSize: 14, paddingTop: 18, paddingBottom: 18 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 44,
            '&.Mui-selected': {
              color: dark ? '#ff9878' : '#b83b1b',
              backgroundColor: alpha('#ff643c', dark ? 0.13 : 0.09),
              boxShadow: 'inset 3px 0 #ff643c',
            },
            '&.Mui-selected:hover': { backgroundColor: alpha('#ff643c', 0.19) },
          },
        },
      },
      // A brighter dark-mode primary keeps links readable. Filled actions use a
      // deeper orange so white labels also meet normal-text contrast requirements.
      MuiButton: {
        styleOverrides: {
          root: {
            variants: [
              {
                props: { variant: 'contained', color: 'primary' },
                style: {
                  color: '#ffffff',
                  backgroundColor: '#b83b1b',
                  '&:hover': { backgroundColor: '#963016' },
                  '&.Mui-disabled': {
                    color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.26)',
                    backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  },
                },
              },
            ],
          },
        },
      },
    },
  });
}

const themes = { light: createDojiTheme('light'), dark: createDojiTheme('dark') };
const desktopThemes = {
  light: createDojiTheme('light', true),
  dark: createDojiTheme('dark', true),
};
export function DojiTheme({
  children,
  mode = 'light',
  desktopWorkspace = false,
}: PropsWithChildren<{ mode?: 'light' | 'dark'; desktopWorkspace?: boolean }>) {
  return (
    <ThemeProvider theme={(desktopWorkspace ? desktopThemes : themes)[mode]}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
