'use client';

import type { ReactNode } from 'react';
import {
  Box,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { BrandLockup } from './BrandLockup';
import { WorkspaceIcon } from './WorkspaceIcon';

export type WorkspaceDestination = { path: string; label: string; group: string };
export function WorkspaceNavigation({
  brand,
  destinations,
  selectedPath,
  navigate,
  hrefFor,
  footer,
}: {
  brand: string;
  destinations: readonly WorkspaceDestination[];
  selectedPath: string | undefined;
  navigate: (path: string) => void;
  hrefFor: (path: string) => string;
  footer: ReactNode;
}) {
  return (
    <Box sx={{ p: 2, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, py: 1.5, mb: 3 }}>
        <BrandLockup label={brand} />
      </Stack>
      <Box component="nav" aria-label="Workspace navigation">
        {[...new Set(destinations.map((item) => item.group))].map((group) => (
          <Box key={group} sx={{ mb: 2 }}>
            <Typography component="h2" variant="overline" color="text.secondary" sx={{ px: 1.5 }}>
              {group}
            </Typography>
            <List disablePadding component="div">
              {destinations
                .filter((item) => item.group === group)
                .map((item) => {
                  const selected = item.path === selectedPath;
                  return (
                    <ListItemButton
                      key={item.path}
                      component="a"
                      href={hrefFor(item.path)}
                      selected={selected}
                      aria-current={selected ? 'page' : undefined}
                      sx={{ mb: 0.5, gap: 1.5, px: 1.5 }}
                      onClick={(event) => {
                        if (
                          event.button ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.altKey ||
                          event.shiftKey
                        )
                          return;
                        event.preventDefault();
                        navigate(item.path);
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>
                        <WorkspaceIcon path={item.path} />
                      </ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        slotProps={{
                          primary: { variant: 'body2', sx: { fontWeight: selected ? 700 : 500 } },
                        }}
                      />
                    </ListItemButton>
                  );
                })}
            </List>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 'auto', pt: 3 }}>
        <Divider sx={{ mb: 2 }} />
        {footer}
      </Box>
    </Box>
  );
}
