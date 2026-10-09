import { Component, type ReactNode } from 'react';
import { Alert, Box, Button } from '@mui/material';

/** A failed lazy chunk cannot leave an authenticated employee on a blank screen. */
export class WorkspaceLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <Box component="main" sx={{ p: 3 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={() => location.reload()}>
                Reload workspace
              </Button>
            }
          >
            The workspace could not open. Reload to restore your employee session.
          </Alert>
        </Box>
      );
    return this.props.children;
  }
}
