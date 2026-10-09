import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DojiTheme } from '@doji/ui/theme';
import { ConnectedAdmin } from './ConnectedAdmin';
import type { createEmployeeSession } from '@doji/portal-data/employee';

declare global {
  interface Window {
    DOJI_REACT_ADMIN_CONFIG?: Parameters<typeof createEmployeeSession>[0];
  }
}
const root = document.getElementById('root');
if (!root) throw Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <DojiTheme mode="dark" desktopWorkspace>
      <ConnectedAdmin config={window.DOJI_REACT_ADMIN_CONFIG} />
    </DojiTheme>
  </StrictMode>,
);
