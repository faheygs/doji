import { uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
export const announcementFilters = ['all', 'draft', 'published', 'cancelled'] as const;
export type AnnouncementFilter = (typeof announcementFilters)[number];
export type AnnouncementCursor = { at: string; id: string } | null;
export function announcementPath(filter: AnnouncementFilter, cursor: AnnouncementCursor) {
  if (
    !announcementFilters.includes(filter) ||
    (cursor &&
      (!uuid(cursor.id) ||
        typeof cursor.at !== 'string' ||
        cursor.at.length > 80 ||
        !Number.isFinite(Date.parse(cursor.at))))
  )
    throw Error('Invalid announcement filters.');
  const params = new URLSearchParams({ kind: 'announcements', limit: '25', filter });
  if (cursor) {
    params.set('beforeAt', cursor.at);
    params.set('beforeId', cursor.id);
  }
  return '/portal/admin/editorial-page?' + params;
}
export function validAnnouncementPath(path: string) {
  try {
    const url = new URL(path, 'https://admin.dojipro.com');
    const at = url.searchParams.get('beforeAt'),
      id = url.searchParams.get('beforeId');
    if (!!at !== !!id) return false;
    return (
      path ===
      announcementPath(
        url.searchParams.get('filter') as AnnouncementFilter,
        at && id ? { at, id } : null,
      )
    );
  } catch {
    return false;
  }
}
