import { Avatar, Box, Stack, Typography } from '@mui/material';
import PersonOutline from '@mui/icons-material/PersonOutlined';
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase();
}
/** Only display names already authorized by the caller; never fetch member photos. */
export function Identity({
  name,
  detail,
  organization = false,
  known = true,
}: {
  name: string;
  detail?: string;
  organization?: boolean;
  known?: boolean;
}) {
  return (
    <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', minWidth: 0 }}>
      <Avatar
        aria-hidden="true"
        variant={organization ? 'rounded' : 'circular'}
        sx={{
          width: 36,
          height: 36,
          fontSize: 13,
          fontWeight: 700,
          bgcolor: known ? 'secondary.dark' : 'action.selected',
          color: known ? '#fff' : 'text.secondary',
        }}
      >
        {known ? initials(name) : <PersonOutline fontSize="small" />}
      </Avatar>
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        {detail && (
          <Typography component="div" variant="caption" color="text.secondary">
            {detail}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
