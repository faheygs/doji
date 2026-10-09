'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  AppBar,
  Button,
  Chip,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import { PreviewNotice } from './layout';
import { WorkspaceNavigation, type WorkspaceDestination } from './WorkspaceNavigation';
export type { WorkspaceDestination } from './WorkspaceNavigation';

type Props = {
  brand: string;
  title: string;
  activePath: string;
  destinations: readonly WorkspaceDestination[];
  navigate: (path: string) => void;
  children: ReactNode;
  mode?: 'preview' | 'connected';
  hrefFor?: (path: string) => string;
  headerActions?: ReactNode;
  navigationFooter?: ReactNode;
};
const directHref = (path: string) => path;

/** Presentation only: authorization and session ownership belong to the caller. */
export function WorkspaceShell({
  brand,
  title,
  activePath,
  destinations,
  navigate,
  children,
  mode = 'preview',
  hrefFor = directHref,
  headerActions,
  navigationFooter,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigationWidth = 264;
  const selectedPath = destinations
    .filter(
      (item) =>
        activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path + '/')),
    )
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
  useEffect(() => {
    document.title = title + ' · ' + brand + (mode === 'preview' ? ' preview' : '');
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [activePath, title, brand, mode]);
  const navigation = (
    <WorkspaceNavigation
      brand={brand}
      destinations={destinations}
      selectedPath={selectedPath}
      hrefFor={hrefFor}
      navigate={(path) => {
        setMenuOpen(false);
        navigate(path);
      }}
      footer={
        navigationFooter ?? (
          <>
            <Typography variant="body2" color="text.secondary">
              {mode === 'preview' ? 'Design workspace' : 'Employee workspace'}
            </Typography>
            {mode === 'preview' && (
              <Typography variant="caption" color="text.secondary">
                Sample data · no live actions
              </Typography>
            )}
          </>
        )
      }
    />
  );
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex' }}>
      <Box
        component="a"
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
        sx={{
          position: 'fixed',
          left: -10000,
          '&:focus': { left: 16, top: 8, zIndex: 1600, p: 1, bgcolor: 'background.paper' },
        }}
      >
        Skip to content
      </Box>
      <Drawer
        variant="permanent"
        slotProps={{ paper: { sx: { width: navigationWidth, boxSizing: 'border-box' } } }}
        sx={{
          display: { xs: 'none', md: 'block' },
          width: navigationWidth,
          flexShrink: 0,
        }}
      >
        {navigation}
      </Drawer>
      <Drawer
        open={menuOpen && !desktop}
        onClose={() => setMenuOpen(false)}
        slotProps={{
          paper: { id: 'workspace-menu', sx: { width: 280 }, 'aria-label': 'Workspace menu' },
        }}
      >
        <Button onClick={() => setMenuOpen(false)} sx={{ alignSelf: 'flex-end', m: 1 }}>
          Close menu
        </Button>
        {navigation}
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          component="header"
          sx={{
            bgcolor: 'background.default',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Toolbar
            sx={{ gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', py: 0.5 }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
              <IconButton
                aria-label="Menu"
                sx={{ display: { md: 'none' } }}
                onClick={() => setMenuOpen(true)}
                aria-expanded={menuOpen && !desktop}
                aria-controls={menuOpen && !desktop ? 'workspace-menu' : undefined}
              >
                <MenuOutlined />
              </IconButton>
              <Typography component="p" variant="subtitle1">
                {title}
              </Typography>
            </Stack>
            {headerActions ??
              (mode === 'preview' ? (
                <Chip label="UI preview" size="small" variant="outlined" />
              ) : null)}
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          id="workspace-main"
          ref={main}
          tabIndex={-1}
          sx={{ p: { xs: 2, md: 4 }, width: '100%', minWidth: 0, outline: 'none' }}
        >
          {mode === 'preview' && (
            <Box sx={{ mb: 4 }}>
              <PreviewNotice />
            </Box>
          )}
          {children}
        </Box>
      </Box>
    </Box>
  );
}
