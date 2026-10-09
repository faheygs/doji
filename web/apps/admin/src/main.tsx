import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createPortalQueryClient } from '@doji/portal-data';
import { DojiTheme } from '@doji/ui';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
// Preview has no authenticated session. Replace this instance on every future auth epoch.
const queryClient = createPortalQueryClient();
createRoot(root).render(
  <StrictMode>
    <DojiTheme mode="dark" desktopWorkspace>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </DojiTheme>
  </StrictMode>,
);
