import { useLayoutEffect, useRef, useState } from 'react';
import type { FlatList } from 'react-native';

/** A local root Post overrides anchoring once, after its row reaches the list. */
export function useCommentPostScroll<Row>(
  request: string | undefined,
  ready: boolean,
  generation?: symbol,
  atHead = true,
) {
  const listRef = useRef<FlatList<Row>>(null);
  const [handled, setHandled] = useState<string>();
  const pending = !!request && ready && request !== handled;
  const previousGeneration = useRef(generation);
  useLayoutEffect(() => {
    if (previousGeneration.current !== generation && atHead && !pending)
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    previousGeneration.current = generation;
  }, [generation, atHead, pending]);
  useLayoutEffect(() => {
    if (!pending || !ready) return;
    // Let the new row commit with anchoring disabled before moving the viewport.
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setHandled(request);
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, ready, request]);
  return { listRef, pending };
}
