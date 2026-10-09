import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import { TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import { readAnnouncement } from '@doji/portal-data/announcements';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { AnnouncementForm } from '../AnnouncementForm';
import { announcementDraft } from '../announcement-draft';
import { announcementSchema, type AnnouncementIntent } from '../announcement';

export function AnnouncementEditor({
  controller,
  id,
}: {
  controller: EmployeeSessionController;
  id?: string | undefined;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const allowed =
    controller.announcementWritesEnabled &&
    state.phase === 'ready' &&
    state.operator?.capabilities.operations_read === true &&
    state.operator.capabilities.operator_manage === true;
  if (!allowed) return <Alert severity="error">Announcement editing is unavailable.</Alert>;
  return <Editor key={state.session?.epoch} controller={controller} id={id} />;
}
function Editor({
  controller,
  id,
}: {
  controller: EmployeeSessionController;
  id?: string | undefined;
}) {
  const session = controller.getSnapshot().session!;
  const flow = controller.getAnnouncementFlow();
  const command = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: portalKey(session, 'announcements', { id: id ?? 'new' }),
    enabled: !!id,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readAnnouncement(controller, id!, signal),
  });
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (['saving', 'uncertain'].includes(flow.getSnapshot().phase)) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [flow]);
  if (
    command.intent &&
    (command.intent.p_action === 'cancel' || command.intent.p_id !== (id ?? null))
  )
    return (
      <Alert
        severity="warning"
        action={
          <Button
            onClick={() =>
              navigate(
                command.intent?.p_action === 'cancel'
                  ? '/announcements/' + command.intent.p_id
                  : command.intent?.p_id
                    ? '/announcements/' + command.intent.p_id + '/edit'
                    : '/announcements/new',
              )
            }
          >
            Resume pending action
          </Button>
        }
      >
        Finish the pending announcement action before starting another.
      </Alert>
    );
  if (command.phase === 'complete')
    return (
      <Alert
        severity="success"
        action={
          <Button
            onClick={() => {
              const target = command.outcome!.id;
              flow.dismiss();
              navigate('/announcements/' + target);
            }}
          >
            View current record
          </Button>
        }
      >
        {command.message}
      </Alert>
    );
  if (id && !command.intent && (query.isPending || query.isError || !query.data))
    return (
      <TableFrame
        label="announcement draft"
        state={query.isError ? 'error' : 'loading'}
        footer={null}
        errorAction={<Button onClick={() => void query.refetch()}>Retry draft</Button>}
      />
    );
  let draft;
  try {
    if (command.intent) {
      const p = command.intent.p_input;
      draft = {
        initial: announcementSchema.parse({
          title: p.title,
          message: p.body,
          timing: command.intent.p_action === 'publish' ? 'now' : 'scheduled',
          start: typeof p.starts_at === 'string' ? Date.parse(p.starts_at) : null,
          end: Date.parse(String(p.ends_at)),
          ctaLabel: p.cta_label ?? '',
          ctaUrl: p.cta_url ?? '',
          priority: p.priority,
          impressions: p.max_impressions_per_user,
          spacing: p.min_hours_between_impressions,
          reward: p.reward_action ?? 'none',
          sparks: p.reward_sparks,
        }),
        target: command.intent.p_id
          ? { id: command.intent.p_id, version: command.intent.p_version! }
          : null,
      };
    } else draft = id ? announcementDraft(query.data!.draft) : undefined;
  } catch {
    return (
      <Alert
        severity="warning"
        action={<Button onClick={() => navigate('/announcements/' + id)}>Return to record</Button>}
      >
        The current record is not a complete editable draft. Nothing was changed.
      </Alert>
    );
  }
  return (
    <AnnouncementForm
      key={id ?? 'new'}
      initial={draft?.initial}
      target={draft?.target}
      submission={{
        intent: command.intent as AnnouncementIntent | null,
        phase: command.phase,
        message: command.message,
        prepare: flow.prepare,
        confirm: () => {
          void flow.submit();
        },
        close: () => {
          if (command.phase === 'rejected') {
            flow.dismiss();
            navigate(id ? '/announcements/' + id : '/announcements');
          } else flow.dismiss();
        },
      }}
    />
  );
}
