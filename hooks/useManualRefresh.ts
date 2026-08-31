import { useCallback, useState } from 'react';

type Refetch = (options?: { cancelRefetch?: boolean }) => Promise<unknown>;

/** Keeps native pull-to-refresh UI separate from silent background reconciliation. */
export function useManualRefresh(refetch: Refetch) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch({ cancelRefetch: false });
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return { refreshing, handleRefresh };
}
