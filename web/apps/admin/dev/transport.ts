import { employeeStagingOrigin } from '../../../../infra/portal-identity/employee-contracts.mts';
import type { PortalFetch } from '../../../../infra/portal-identity/portal-contracts.mts';

export const localAdminOrigin = 'http://127.0.0.1:4313';
export const localStagingFlags = Object.freeze({
  independentEmployeeIdentity: true,
  staffWorkflowEnabled: true,
  businessApplicationsEnabled: true,
  businessPrivacyEnabled: true,
  healthEventsEnabled: false,
  announcementComposeEnabled: true,
  historyReadsEnabled: true,
});
export const localRoutes: Readonly<Record<string, string>> = Object.freeze({
  '/auth/start': 'POST',
  '/auth/complete': 'POST',
  '/auth/logout': 'POST',
  '/api/session': 'GET',
  '/api/rpc': 'POST',
});

// Only the separate development entry imports this adapter. Hosted transport
// origin checks remain unchanged; the local server applies its own CSRF checks.
export function localStagingFetch(origin: string, upstream: PortalFetch = fetch): PortalFetch {
  if (origin !== localAdminOrigin) throw Error('Use the fixed admin staging loopback address.');
  return (input, options) => {
    const url = new URL(String(input));
    if (
      url.origin !== employeeStagingOrigin ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      localRoutes[url.pathname] !== (options?.method ?? 'GET')
    )
      throw Error('Invalid local staging destination.');
    return upstream(localAdminOrigin + url.pathname, {
      ...options,
      credentials: 'same-origin',
      redirect: 'error',
    });
  };
}
