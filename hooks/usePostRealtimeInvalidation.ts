import { useFocusedRealtimeInvalidation } from './useFocusedRealtimeInvalidation';
import { realtimeQueryRoots } from '../lib/realtimeQueryRoots';

/** Keep only visible, unlocked feed cards subscribed to their post channel. */
export function usePostRealtimeInvalidation(postId: string, enabled: boolean) {
  useFocusedRealtimeInvalidation(`post:${postId}`, realtimeQueryRoots, enabled);
}
