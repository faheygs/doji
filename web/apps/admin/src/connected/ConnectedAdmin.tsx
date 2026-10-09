import { lazy, Suspense, useState } from 'react';
import { Alert, Box } from '@mui/material';
import { TableFrame } from '@doji/ui/layout';
import { createEmployeeSession } from '@doji/portal-data/employee';
import { EmployeeAccess } from './EmployeeAccess';
import { WorkspaceLoadBoundary } from './WorkspaceLoadBoundary';

const EmployeeWorkspace = lazy(() =>
  import('./ConnectedWorkspace').then((module) => ({ default: module.EmployeeWorkspace })),
);
type Config = Parameters<typeof createEmployeeSession>[0];
export function ConnectedAdmin({ config }: { config: Config | undefined }) {
  const [controller] = useState(() => {
    if (!config?.independentEmployeeIdentity || location.origin !== 'https://admin.dojipro.com')
      return null;
    return createEmployeeSession(config);
  });
  if (!controller)
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="warning">
          Connected admin is not configured for this origin. The approved production-origin and
          deployment configuration are required; no session or API request was made.
        </Alert>
      </Box>
    );
  return (
    <EmployeeAccess controller={controller}>
      <WorkspaceLoadBoundary>
        <Suspense
          fallback={
            <Box sx={{ p: 3 }}>
              <TableFrame label="employee workspace" state="loading" footer={null} />
            </Box>
          }
        >
          <EmployeeWorkspace
            controller={controller}
            realtimeEnabled={config?.staffWorkflowEnabled === true}
          />
        </Suspense>
      </WorkspaceLoadBoundary>
    </EmployeeAccess>
  );
}
