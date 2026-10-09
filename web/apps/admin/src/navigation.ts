import type { WorkspaceDestination } from '@doji/ui';

export const destinations: readonly WorkspaceDestination[] = [
  { path: '/', label: 'Overview', group: 'Workspace' },
  { path: '/my-work', label: 'My work', group: 'Workspace' },
  { path: '/trust-safety', label: 'Trust & safety', group: 'Review' },
  { path: '/restricted-safety', label: 'Restricted safety', group: 'Review' },
  { path: '/community-ideas', label: 'Community ideas', group: 'Review' },
  { path: '/businesses', label: 'Business applications', group: 'Business' },
  { path: '/business-privacy', label: 'Business privacy', group: 'Business' },
  { path: '/sponsored-dojis', label: 'Sponsored Dojis', group: 'Business' },
  { path: '/operations', label: 'Platform health', group: 'Manage' },
  { path: '/announcements', label: 'Announcements', group: 'Manage' },
  { path: '/audit', label: 'Audit log', group: 'Manage' },
  { path: '/team', label: 'Team & access', group: 'Manage' },
];

export function destinationFor(path: string) {
  return destinations.find(
    (item) => item.path === path || (item.path !== '/' && path.startsWith(item.path + '/')),
  );
}
