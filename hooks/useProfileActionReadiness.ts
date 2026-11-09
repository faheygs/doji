import { useRef } from 'react';

type ReadState = { isStale: boolean; isFetchedAfterMount: boolean; isError: boolean };

/** Only stale-on-entry action data needs a fresh read. Ordinary cache aging while
 * the profile is open must not hide a button or introduce a polling requirement.
 */
export function useProfileActionReadiness(
  targetId: string | undefined,
  relationship: ReadState,
  block: ReadState,
) {
  const entry = useRef<{
    targetId?: string;
    relationshipStale: boolean;
    blockStale: boolean;
  } | null>(null);
  if (!entry.current || entry.current.targetId !== targetId) {
    entry.current = {
      targetId,
      relationshipStale: relationship.isStale,
      blockStale: block.isStale,
    };
  }
  return (
    (!entry.current.relationshipStale ||
      (relationship.isFetchedAfterMount && !relationship.isError)) &&
    (!entry.current.blockStale || (block.isFetchedAfterMount && !block.isError))
  );
}
