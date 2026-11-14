import type { QueryClient } from '@tanstack/react-query';

/** Privacy changes must discard the old winner before an authorized reread. */
export function clearFirstDoji(client: QueryClient) {
  void client.cancelQueries({ queryKey: ['firstDoji'] }, { revert: false });
  client.setQueriesData({ queryKey: ['firstDoji'] }, null);
}
