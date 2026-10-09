import { useRef, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@mui/material';
import { portalKey } from '@doji/portal-data';
import { readEmployeeTeam } from '@doji/portal-data/employee-team';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { TeamRoleForm, type TeamRoleEditor } from './TeamRoleForm';
import { TeamAccessPanel } from '../TeamAccessPanel';

export function TeamRecord({ controller }: { controller: EmployeeSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const editor = useRef<TeamRoleEditor>(null);
  const allowed = !!state.session && state.operator?.capabilities.operator_manage === true;
  const query = useQuery({
    queryKey: state.session ? portalKey(state.session, 'team') : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readEmployeeTeam(controller, signal),
  });
  if (!allowed) return <Alert severity="error">Employee access management is unavailable.</Alert>;
  return (
    <TeamAccessPanel
      items={query.isError ? [] : (query.data ?? [])}
      state={query.isPending ? 'loading' : query.isError ? 'error' : 'ready'}
      manage={(email) => editor.current?.selectEmployee(email) ?? false}
      canLeave={() => editor.current?.canLeave() ?? false}
      retry={() => void query.refetch()}
      editor={
        <TeamRoleForm
          ref={editor}
          controller={controller}
          available={query.isSuccess && !query.isFetching}
          refresh={async () => (await query.refetch()).isSuccess}
        />
      }
    />
  );
}
