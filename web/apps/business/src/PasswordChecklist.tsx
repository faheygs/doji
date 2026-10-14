import { useId, useState } from 'react';
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import HelpOutline from '@mui/icons-material/HelpOutlined';
import type { PasswordFeedback } from './usePasswordFeedback';
import { businessPasswordMinimum } from '../../../../infra/portal-identity/business-password-policy.mts';

export function PasswordChecklist({
  feedback,
  showEmail,
  id,
}: {
  feedback: PasswordFeedback;
  showEmail: boolean;
  id: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const tipsId = useId();
  const rows: [string, boolean][] = [
    [`At least ${businessPasswordMinimum} characters`, feedback.length],
    ['Hard to guess', feedback.strength === 'strong'],
    ...(showEmail
      ? [['Doesn’t include your email', feedback.excludesEmail] as [string, boolean]]
      : []),
  ];
  return (
    <Box>
      <List id={id} dense disablePadding aria-label="Password checklist" aria-live="polite">
        {rows.map(([label, met]) => (
          <ListItem
            key={label}
            aria-label={`${label}: ${met ? 'Met' : 'Not met yet'}`}
            disableGutters
            disablePadding
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              {met ? (
                <CheckCircleOutline fontSize="small" color="success" />
              ) : (
                <RadioButtonUnchecked fontSize="small" color="disabled" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={label}
              slotProps={{
                primary: { variant: 'body2', color: met ? 'success.main' : 'text.secondary' },
              }}
            />
          </ListItem>
        ))}
      </List>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" role="status">
          {feedback.strength === 'checking'
            ? 'Checking strength…'
            : feedback.strength === 'unavailable'
              ? 'Strength check unavailable'
              : feedback.strength === 'weak'
                ? 'Try another word or a less familiar phrase.'
                : ''}
        </Typography>
        <Button
          size="small"
          type="button"
          startIcon={<HelpOutline />}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchor)}
          aria-controls={anchor ? tipsId : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          Password tips
        </Button>
      </Stack>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack
          id={tipsId}
          role="dialog"
          aria-label="Password tips"
          spacing={1}
          sx={{ p: 2, maxWidth: 320 }}
        >
          <Typography variant="subtitle2">Make it memorable, not predictable</Typography>
          <Typography variant="body2">
            Aim for 12–16 characters, or use a longer passphrase with a few unrelated words.
          </Typography>
          <Typography variant="body2">
            A password manager can create and save one for you. Avoid your name, email, and common
            passwords.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Strength is estimated on your device. We’ll confirm it when you continue.
          </Typography>
          <Button size="small" onClick={() => setAnchor(null)} sx={{ alignSelf: 'flex-end' }}>
            Got it
          </Button>
        </Stack>
      </Popover>
    </Box>
  );
}
