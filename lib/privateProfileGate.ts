import type { ViewerFollowStatus } from '../hooks/useFollows';

export function privateGateCopy(followStatus: ViewerFollowStatus): { title: string; body: string } {
  switch (followStatus) {
    case 'pending_out':
      return {
        title: 'Request pending',
        body: 'They need to approve your request first.',
      };
    case 'pending_in':
      return {
        title: 'Private account',
        body: 'They want to follow you.',
      };
    case 'blocked':
      return {
        title: 'Unavailable',
        body: "You can't view this profile.",
      };
    default:
      return {
        title: 'Private account',
        body: 'Follow to see their activity.',
      };
  }
}
