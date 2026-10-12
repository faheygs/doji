import { MenuItem, TextField } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export const ideaStatuses = {
  pending: 'Pending review',
  all: 'All ideas',
  approved: 'Accepted',
  rejected: 'Declined',
};
export const businessStatuses = {
  open: 'Open applications',
  pending: 'Pending review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  declined: 'Declined',
};
export function QueueStatusFilter({
  area,
  value,
}: {
  area: 'community-ideas' | 'businesses';
  value: string;
}) {
  const navigate = useNavigate();
  const choices = area === 'community-ideas' ? ideaStatuses : businessStatuses;
  return (
    <TextField
      size="small"
      select
      label={area === 'community-ideas' ? 'Idea status' : 'Application status'}
      value={value}
      onChange={(event) => navigate('/' + area + '?filter=' + event.target.value)}
    >
      {Object.entries(choices).map(([key, label]) => (
        <MenuItem key={key} value={key}>
          {label}
        </MenuItem>
      ))}
    </TextField>
  );
}
