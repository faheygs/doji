import { lazy, Suspense, useState } from 'react';
import { Alert, Box } from '@mui/material';
import { TableFrame } from '@doji/ui/layout';
import { createEmployeeSession } from '@doji/portal-data/employee';
import { EmployeeAccess } from './EmployeeAccess';
import { WorkspaceLoadBoundary } from './WorkspaceLoadBoundary';
import { StagingEnvironment } from './StagingEnvironment';
import {
  isEmployeeOrigin,
  employeeStagingOrigin,
} from '../../../../../infra/portal-identity/employee-contracts.mts';

const EmployeeWorkspace = lazy(() =>
  import('./ConnectedWorkspace').then((module) => ({ default: module.EmployeeWorkspace })),
);
type Config = Parameters<typeof createEmployeeSession>[0] & {
  staffWorkflowRealtimeEnabled?: boolean;
};
export function ConnectedAdmin({ config }: { config: Config | undefined }) {
  const [controller] = useState(() => {
    if (!config?.independentEmployeeIdentity || !isEmployeeOrigin(location.origin)) return null;
    return createEmployeeSession(config);
  });
  return (
    <EmployeeSessionView
      controller={controller}
      realtimeEnabled={
        config?.staffWorkflowEnabled === true && config.staffWorkflowRealtimeEnabled !== false
      }
      staging={location.origin === employeeStagingOrigin}
    />
  );
}

export function EmployeeSessionView({
  controller,
  realtimeEnabled,
  staging = false,
}: {
  controller: ReturnType<typeof createEmployeeSession> | null;
  realtimeEnabled: boolean;
  staging?: boolean;
}) {
  if (!controller)
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="warning">
          Admin is not configured for this environment. No session or API request was made.
        </Alert>
      </Box>
    );
  const content = (
    <>
      <EmployeeAccess controller={controller}>
        <WorkspaceLoadBoundary>
          <Suspense
            fallback={
              <Box sx={{ p: 3 }}>
                <TableFrame label="employee workspace" state="loading" footer={null} />
              </Box>
            }
          >
            <EmployeeWorkspace controller={controller} realtimeEnabled={realtimeEnabled} />
          </Suspense>
        </WorkspaceLoadBoundary>
      </EmployeeAccess>
    </>
  );
  return staging ? <StagingEnvironment>{content}</StagingEnvironment> : content;
}
