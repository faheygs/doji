'use client';

import { useState } from 'react';
import { Avatar, IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import { initials } from './Identity';
export function AccountMenu({ name, signOut }: { name: string; signOut: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={name}>
        <IconButton
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          aria-controls={anchor ? 'employee-account-menu' : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <Avatar
            sx={{ width: 34, height: 34, fontSize: 13, bgcolor: 'secondary.dark', color: '#fff' }}
          >
            {initials(name)}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        id="employee-account-menu"
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            signOut();
          }}
        >
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Lock and sign out
        </MenuItem>
      </Menu>
    </>
  );
}
