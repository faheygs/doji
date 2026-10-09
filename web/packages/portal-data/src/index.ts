import { QueryClient } from '@tanstack/react-query';

export type PortalRealm = 'employee' | 'business';
export type PortalSession = Readonly<{ realm: PortalRealm; subject: string; epoch: string }>;
export type ReadArea =
  | 'announcements'
  | 'work'
  | 'safety'
  | 'application'
  | 'operations'
  | 'audit'
  | 'team';

/** Separate memory-only cache per authenticated session, never shared with the member app. */
export function createPortalQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  });
}
export function portalKey(
  session: PortalSession,
  area: ReadArea,
  parameters: Readonly<Record<string, string>> = {},
) {
  return ['portal', session.realm, session.subject, session.epoch, area, parameters] as const;
}
/** Transport adapters must abort/close requests and subscriptions before disposal. */
export async function disposePortalCache(client: QueryClient) {
  await client.cancelQueries();
  client.clear();
}
/** Call only after the existing transport validates topic, permission, payload and epoch.
 * No event payload is authoritative data. This creates no socket or polling loop.
 */
export async function invalidatePortalAreas(
  client: QueryClient,
  session: PortalSession,
  areas: readonly ReadArea[],
) {
  await Promise.all(
    [...new Set(areas)].map((area) =>
      client.invalidateQueries({
        queryKey: portalKey(session, area).slice(0, 5),
        refetchType: 'active',
      }),
    ),
  );
}
export function isCurrentSession(current: PortalSession | null, captured: PortalSession) {
  return (
    current !== null &&
    current.realm === captured.realm &&
    current.subject === captured.subject &&
    current.epoch === captured.epoch
  );
}
