import { useState } from 'react';
import { Alert, Stack, TextField } from '@mui/material';
import { TeamAccessPanel } from './TeamAccessPanel';

const items = [
  {
    id: 'preview-owner',
    name: 'Alex Morgan',
    email: 'alex@example.test',
    status: 'active',
    roles: ['super_admin'] as const,
    changedAt: '2026-10-09T12:00:00Z',
  },
  {
    id: 'preview-reviewer',
    name: 'Sam Rivera',
    email: 'sam@example.test',
    status: 'active',
    roles: ['moderator'] as const,
    changedAt: '2026-10-09T12:00:00Z',
  },
];
export function TeamPreview() {
  const [email, setEmail] = useState('');
  return (
    <TeamAccessPanel
      items={items.map((item) => ({ ...item, roles: [...item.roles] }))}
      state="ready"
      manage={setEmail}
      retry={() => undefined}
      editor={
        <Stack sx={{ gap: 2 }}>
          <Alert severity="info">
            Design preview. These people are synthetic; no access can be changed.
          </Alert>
          <TextField
            label="Employee email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField label="Employee role" value="Choose a role in the connected portal" disabled />
        </Stack>
      }
    />
  );
}
