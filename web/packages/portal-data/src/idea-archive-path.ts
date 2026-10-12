import { uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import { checkedPageSize } from './page-size';
export const ideaFilters = ['all', 'pending', 'approved', 'rejected'] as const;
export type IdeaFilter = (typeof ideaFilters)[number];
export type IdeaCursor = { at: string; id: string } | null;
export function ideaArchivePath(filter: IdeaFilter, cursor: IdeaCursor, pageSize = 25) {
  if (
    !ideaFilters.includes(filter) ||
    (cursor &&
      (!uuid(cursor.id) ||
        typeof cursor.at !== 'string' ||
        cursor.at.length > 80 ||
        !Number.isFinite(Date.parse(cursor.at))))
  )
    throw Error('Invalid idea history filters.');
  const params = new URLSearchParams({
    kind: 'suggestions',
    limit: String(checkedPageSize(pageSize)),
    filter,
  });
  if (cursor) {
    params.set('beforeAt', cursor.at);
    params.set('beforeId', cursor.id);
  }
  return '/portal/admin/editorial-page?' + params;
}
export function validIdeaArchivePath(path: string) {
  try {
    const url = new URL(path, 'https://admin.dojipro.com');
    const at = url.searchParams.get('beforeAt'),
      id = url.searchParams.get('beforeId');
    if (!!at !== !!id) return false;
    return (
      path ===
      ideaArchivePath(
        url.searchParams.get('filter') as IdeaFilter,
        at && id ? { at, id } : null,
        Number(url.searchParams.get('limit')),
      )
    );
  } catch {
    return false;
  }
}
