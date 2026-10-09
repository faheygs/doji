import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Chip, Stack } from '@mui/material';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import { AccountMenu, Identity, PageHeader, TableFrame, WorkspaceShell } from '@doji/ui';

import type { EmployeeSessionController } from '@doji/portal-data/employee';
import {
  canReadQueue,
  queueDefinitions,
  type EmployeeQueue as QueueArea,
} from '@doji/portal-data/employee-queues';

import { EmployeeQueue } from './EmployeeQueue';
import { attachEmployeeRealtime, type EmployeeConnection } from './employee-realtime';
import { destinations } from '../navigation';

const hashHref = (path: string) => '#' + path;
const WorkspaceOverview = lazy(() =>
  import('./WorkspaceOverview').then((module) => ({ default: module.WorkspaceOverview })),
);
const AnnouncementsQueue = lazy(() =>
  import('./AnnouncementsQueue').then((module) => ({ default: module.AnnouncementsQueue })),
);
const AnnouncementRecord = lazy(() =>
  import('./AnnouncementRecord').then((module) => ({ default: module.AnnouncementRecord })),
);
const AnnouncementEditor = lazy(() =>
  import('./AnnouncementEditor').then((module) => ({ default: module.AnnouncementEditor })),
);
const PrivacyCreate = lazy(() =>
  import('./PrivacyCreate').then((module) => ({ default: module.PrivacyCreate })),
);
const PrivacyQueue = lazy(() =>
  import('./PrivacyQueue').then((module) => ({ default: module.PrivacyQueue })),
);
const PrivacyRecord = lazy(() =>
  import('./PrivacyRecord').then((module) => ({ default: module.PrivacyRecord })),
);
const IdeaArchive = lazy(() =>
  import('./IdeaArchive').then((module) => ({ default: module.IdeaArchive })),
);
const TeamRecord = lazy(() =>
  import('./TeamRecord').then((module) => ({ default: module.TeamRecord })),
);
const AuditRecord = lazy(() =>
  import('./AuditRecord').then((module) => ({ default: module.AuditRecord })),
);
const IdeaRecord = lazy(() =>
  import('./IdeaRecord').then((module) => ({ default: module.IdeaRecord })),
);
const ModerationRecord = lazy(() =>
  import('./ModerationRecord').then((module) => ({ default: module.ModerationRecord })),
);
const SafetyRecord = lazy(() =>
  import('./SafetyRecord').then((module) => ({ default: module.SafetyRecord })),
);
const OperationsRecord = lazy(() =>
  import('./OperationsRecord').then((module) => ({ default: module.OperationsRecord })),
);
const BusinessRecord = lazy(() =>
  import('./BusinessRecord').then((module) => ({ default: module.BusinessRecord })),
);

export function ConnectedWorkspace({
  controller,
  realtimeEnabled = false,
}: {
  controller: EmployeeSessionController;
  realtimeEnabled?: boolean;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const overview = pathname === '/';
  const announcementEditId =
    /^\/announcements\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\/edit$/i.exec(pathname)?.[1];
  const announcementEditor =
    controller.announcementWritesEnabled &&
    (pathname === '/announcements/new' || !!announcementEditId);
  const announcementId = /^\/announcements\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.exec(
    pathname,
  )?.[1];
  const announcements =
    (pathname === '/announcements' || !!announcementId || announcementEditor) &&
    state.operator?.capabilities.operations_read === true;
  const team = pathname === '/team' && state.operator?.capabilities.operator_manage === true;
  const privacyId = /^\/business-privacy\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.exec(
    pathname,
  )?.[1];
  const audit = pathname === '/audit' && state.operator?.capabilities.operations_read === true;
  const ideaId = /^\/community-ideas\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.exec(
    pathname,
  )?.[1];
  const operations =
    pathname === '/operations' && state.operator?.capabilities.operations_read === true;
  const businessId = /^\/businesses\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.exec(
    pathname,
  )?.[1];
  const safetyMatch =
    /^\/(trust-safety|restricted-safety|my-work|overview)\/external\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.exec(
      pathname,
    );
  const moderationMatch =
    /^\/(trust-safety|restricted-safety|my-work|overview)\/(report|appeal)\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.exec(
      pathname,
    );
  const ideaArchive = pathname === '/community-ideas/archive';
  const privacyNew = pathname === '/business-privacy/new';
  const area =
    privacyId || privacyNew
      ? 'business-privacy'
      : ideaId || ideaArchive
        ? 'community-ideas'
        : moderationMatch
          ? moderationMatch[1] === 'overview'
            ? 'my-work'
            : (moderationMatch[1] as QueueArea)
          : safetyMatch
            ? safetyMatch[1] === 'overview'
              ? 'my-work'
              : (safetyMatch[1] as QueueArea)
            : businessId
              ? 'businesses'
              : (Object.keys(queueDefinitions) as QueueArea[]).find(
                  (key) => pathname === '/' + key,
                );
  const [connection, setConnection] = useState<EmployeeConnection>('disabled');
  useEffect(
    () => attachEmployeeRealtime(controller, realtimeEnabled, setConnection),
    [controller, realtimeEnabled, state.session],
  );
  if (!state.operator) return null;
  const available = destinations.filter((item) => {
    if (item.path === '/') return true;
    if (item.path === '/team') return state.operator!.capabilities.operator_manage === true;
    if (['/operations', '/audit', '/announcements'].includes(item.path))
      return state.operator!.capabilities.operations_read === true;
    const key = item.path.slice(1) as QueueArea;
    return Object.hasOwn(queueDefinitions, key) && canReadQueue(state.operator!, key);
  });
  const allowed = area && canReadQueue(state.operator, area);
  return (
    <WorkspaceShell
      brand="Doji Admin"
      title={
        overview || pathname.startsWith('/overview/')
          ? 'Overview'
          : announcements
            ? 'Announcements'
            : team
              ? 'Team & access'
              : audit
                ? 'Audit log'
                : operations
                  ? 'Platform health'
                  : allowed
                    ? queueDefinitions[area].label
                    : 'Page unavailable'
      }
      mode="connected"
      activePath={pathname.startsWith('/overview/') ? '/' : pathname}
      destinations={available}
      navigate={navigate}
      hrefFor={hashHref}
      headerActions={
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            size="small"
            color={connection === 'connected' ? 'success' : 'default'}
            variant="outlined"
            label={'Queue updates: ' + connection}
          />
          <AccountMenu
            name={state.operator.display_name}
            signOut={() => void controller.signOut()}
          />
        </Stack>
      }
      navigationFooter={<Identity name={state.operator.display_name} detail="Employee workspace" />}
    >
      {overview || announcements ? (
        <Suspense
          fallback={
            <TableFrame
              label={overview ? 'overview' : 'announcements'}
              state="loading"
              footer={null}
            />
          }
        >
          {overview ? (
            <WorkspaceOverview controller={controller} destinations={available} />
          ) : announcementEditor ? (
            <AnnouncementEditor
              key={(announcementEditId ?? 'new') + state.session?.epoch}
              controller={controller}
              id={announcementEditId}
            />
          ) : announcementId ? (
            <AnnouncementRecord
              key={announcementId + state.session?.epoch}
              controller={controller}
              id={announcementId}
            />
          ) : (
            <AnnouncementsQueue key={state.session?.epoch} controller={controller} />
          )}
        </Suspense>
      ) : team ? (
        <Suspense
          fallback={<TableFrame label="employee directory" state="loading" footer={null} />}
        >
          <TeamRecord key={state.session?.epoch} controller={controller} />
        </Suspense>
      ) : audit ? (
        <Suspense fallback={<TableFrame label="audit log" state="loading" footer={null} />}>
          <AuditRecord key={state.session?.epoch} controller={controller} />
        </Suspense>
      ) : operations ? (
        <Suspense fallback={<TableFrame label="platform health" state="loading" footer={null} />}>
          <OperationsRecord key={state.session?.epoch} controller={controller} />
        </Suspense>
      ) : allowed ? (
        area === 'business-privacy' ? (
          <Suspense
            fallback={<TableFrame label="business privacy" state="loading" footer={null} />}
          >
            {privacyNew ? (
              <PrivacyCreate key={state.session?.epoch} controller={controller} />
            ) : privacyId ? (
              <PrivacyRecord
                key={privacyId + state.session?.epoch}
                controller={controller}
                id={privacyId}
              />
            ) : (
              <PrivacyQueue key={state.session?.epoch} controller={controller} />
            )}
          </Suspense>
        ) : ideaArchive ? (
          <Suspense fallback={<TableFrame label="idea history" state="loading" footer={null} />}>
            <IdeaArchive key={state.session?.epoch} controller={controller} />
          </Suspense>
        ) : ideaId ? (
          <Suspense fallback={<TableFrame label="community idea" state="loading" footer={null} />}>
            <IdeaRecord key={ideaId + state.session?.epoch} controller={controller} id={ideaId} />
          </Suspense>
        ) : moderationMatch && state.operator.capabilities.moderation_read ? (
          <Suspense fallback={<TableFrame label="case evidence" state="loading" footer={null} />}>
            <ModerationRecord
              key={moderationMatch[2]! + moderationMatch[3]! + state.session?.epoch}
              controller={controller}
              kind={moderationMatch[2] as 'report' | 'appeal'}
              id={moderationMatch[3]!}
              area={moderationMatch[1]!}
            />
          </Suspense>
        ) : safetyMatch && state.operator.capabilities.moderation_read ? (
          <Suspense fallback={<TableFrame label="safety record" state="loading" footer={null} />}>
            <SafetyRecord
              key={safetyMatch[2] + String(state.session?.epoch)}
              controller={controller}
              id={safetyMatch[2]!}
              area={safetyMatch[1]!}
            />
          </Suspense>
        ) : businessId ? (
          <Suspense fallback={<TableFrame label="business record" state="loading" footer={null} />}>
            <BusinessRecord
              key={businessId + state.session?.epoch}
              controller={controller}
              id={businessId}
            />
          </Suspense>
        ) : (
          <EmployeeQueue key={area + state.session?.epoch} controller={controller} area={area} />
        )
      ) : (
        <>
          <PageHeader
            title="Page unavailable"
            description="Choose an available area from the navigation."
          />
          <Alert severity="info">
            This page is not available in this candidate or your employee permissions.
          </Alert>
        </>
      )}
    </WorkspaceShell>
  );
}

export function EmployeeWorkspace({
  controller,
  realtimeEnabled,
}: {
  controller: EmployeeSessionController;
  realtimeEnabled: boolean;
}) {
  return (
    <HashRouter>
      <ConnectedWorkspace controller={controller} realtimeEnabled={realtimeEnabled} />
    </HashRouter>
  );
}
