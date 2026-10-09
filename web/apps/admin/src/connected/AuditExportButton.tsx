import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { AuditCategory } from '@doji/portal-data/employee-audit';
import { auditCsv, readAuditExport } from '@doji/portal-data/audit-export';

export function AuditExportButton({
  controller,
  category,
  search,
}: {
  controller: EmployeeSessionController;
  category: AuditCategory;
  search: string;
}) {
  const scope = useRef<AbortController | null>(null),
    running = useRef(false);
  const [state, setState] = useState({ busy: false, error: false, message: '' });
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => abort.abort();
  }, []);
  async function download() {
    const abort = scope.current,
      captured = controller.getSnapshot().session;
    if (!abort || abort.signal.aborted || running.current || !captured) return;
    running.current = true;
    setState({ busy: true, error: false, message: '' });
    const current = () => !abort.signal.aborted && controller.getSnapshot().session === captured;
    try {
      const value = await readAuditExport(controller, category, search, abort.signal);
      if (!current()) return;
      const blob = new Blob(['\uFEFF', auditCsv(value.items)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'doji-audit-' + new Date().toISOString().slice(0, 10) + '.csv';
      try {
        link.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setState({
        busy: false,
        error: false,
        message:
          'Exported ' +
          value.items.length +
          ' matching events' +
          (value.truncated ? ' (server limit reached; this is not the complete history).' : '.'),
      });
    } catch {
      if (current())
        setState({
          busy: false,
          error: true,
          message: 'Audit export unavailable. No file was downloaded.',
        });
    } finally {
      running.current = false;
    }
  }
  return (
    <Stack sx={{ gap: 1 }}>
      <Button onClick={() => void download()} disabled={state.busy}>
        {' '}
        {state.busy ? 'Preparing CSV…' : 'Export matching CSV'}{' '}
      </Button>
      {state.message && <Alert severity={state.error ? 'error' : 'info'}>{state.message}</Alert>}
    </Stack>
  );
}
