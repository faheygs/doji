import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { PageHeader, QueuePagination, TableFrame } from '@doji/ui';

export function AnnouncementsPreview() {
  const [state, setState] = useState<'empty' | 'loading' | 'error'>('empty');
  return (
    <>
      <PageHeader
        title="Announcements"
        description="Create and schedule in-app messages."
        action={
          <Button component={RouterLink} to="/announcements/new" variant="contained">
            New announcement
          </Button>
        }
      />
      <TableFrame
        label="announcements"
        state={state}
        emptyMessage="No sample announcements. Create a preview to try the new form."
        toolbar={
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="preview-state">Preview table state</InputLabel>
            <Select
              labelId="preview-state"
              label="Preview table state"
              value={state}
              onChange={(event) => setState(event.target.value as typeof state)}
            >
              <MenuItem value="empty">Empty</MenuItem>
              <MenuItem value="loading">Loading</MenuItem>
              <MenuItem value="error">Error</MenuItem>
            </Select>
          </FormControl>
        }
        errorAction={<Button onClick={() => setState('empty')}>Reset preview</Button>}
        footer={
          <QueuePagination
            page={1}
            count={0}
            rowsPerPage={10}
            state={state}
            hasPrevious={false}
            hasNext={false}
            previous={() => {}}
            next={() => {}}
          />
        }
      />
    </>
  );
}
