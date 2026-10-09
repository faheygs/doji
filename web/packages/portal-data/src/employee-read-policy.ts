import { validAuditPath } from './employee-audit';
import { validAuditExportPath } from './audit-export';
import { validIdeaArchivePath } from './idea-archive-path';
import { validAnnouncementPath } from './announcement-path';
const postReads = new Set([
  '/staff-workflow/inbox',
  '/staff-workflow/safety',
  '/staff-workflow/channels',
  '/staff-workflow/ownership',
  '/staff-workflow/assignees',
  '/business/item',
  '/business-privacy/page',
  '/business-privacy/case',
  '/business-privacy/access',
  '/business-privacy/correction',
  '/safety/case',
  '/safety/target',
]);
const getReads = new Set([
  '/portal/admin/command-center?limit=1',
  '/portal/admin/operators',
  '/portal/admin/realtime-token',
  '/portal/admin/platform-health',
  '/portal/admin/platform-health-history?limit=12',
]);
/** A query callback cannot accidentally dispatch an administrative command. */
export function assertEmployeeRead(path: string, hasBody: boolean) {
  if (!hasBody && validIdeaArchivePath(path)) return;
  if (!hasBody && validAnnouncementPath(path)) return;
  if (!hasBody && validAuditPath(path)) return;
  if (!hasBody && validAuditExportPath(path)) return;
  if (
    !hasBody &&
    /^\/portal\/admin\/editorial-item\?kind=(suggestions|announcements)&id=[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(
      path,
    )
  )
    return;
  if (
    !hasBody &&
    /^\/portal\/admin\/(report-case-v3|appeal-case)\?id=[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(
      path,
    )
  )
    return;
  if (!(hasBody ? postReads : getReads).has(path)) throw Error('Unsupported employee read.');
}
