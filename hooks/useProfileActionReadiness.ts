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
    ready: boolean;
  } | null>(null);
  if (!entry.current || entry.current.targetId !== targetId) {
    entry.current = {
      targetId,
      relationshipStale: relationship.isStale,
      blockStale: block.isStale,
      ready: false,
    };
  }
  if (
    !relationship.isError &&
    !block.isError &&
    (!entry.current.relationshipStale ||
      (relationship.isFetchedAfterMount && !relationship.isError)) &&
    (!entry.current.blockStale || (block.isFetchedAfterMount && !block.isError))
  )
    entry.current.ready = true;
  // A background refresh failure must not dismantle a resolved action bar.
  // Callers keep the last label, disable commands and offer an explicit retry.
  return entry.current.ready;
}
