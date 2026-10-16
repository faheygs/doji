import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DojiTheme } from '@doji/ui/theme';
import { createEmployeeSession } from '@doji/portal-data/employee';
import { EmployeeSessionView } from '../src/connected/ConnectedAdmin';
import { employeeStagingOrigin } from '../../../../infra/portal-identity/employee-contracts.mts';
import { localStagingFetch, localStagingFlags } from './transport';

if (!import.meta.env.DEV || import.meta.env.MODE !== 'staging-local')
  throw Error('This entry is for local staging development only.');
const controller = createEmployeeSession(localStagingFlags, {
  origin: employeeStagingOrigin,
  upstream: localStagingFetch(location.origin),
});
const root = document.getElementById('root');
if (!root) throw Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <DojiTheme mode="dark" desktopWorkspace>
      <EmployeeSessionView
        controller={controller}
        realtimeEnabled={false}
        staging
      />
    </DojiTheme>
  </StrictMode>,
);
