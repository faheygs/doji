import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { RecordSection } from '@doji/ui';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { EvidenceReference } from '@doji/portal-data/moderation-evidence';

function EvidenceItem({
  controller,
  reference,
  restricted,
}: {
  controller: EmployeeSessionController;
  reference: EvidenceReference;
  restricted: boolean;
}) {
  const scope = useRef<AbortController | null>(null);
  const running = useRef(false);
  const [value, setValue] = useState<{ url: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(
      () => {
        setValue(null);
        setMessage('Preview expired. Open it again to reauthorize.');
      },
      Math.max(0, value.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [value]);
  async function open() {
    const abort = scope.current;
    if (!abort || abort.signal.aborted || running.current) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    setValue(null);
    try {
      const next = await controller.readEvidence(reference, restricted, abort.signal);
      if (!abort.signal.aborted) setValue(next);
    } catch {
      if (!abort.signal.aborted)
        setMessage('Evidence could not be opened. No public-media fallback was used.');
    } finally {
      running.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  const label = reference.slot.replaceAll('_', ' ');
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography>{label}</Typography>
      {reference.availability !== 'available' ? (
        <Alert severity="warning">
          Evidence unavailable: {reference.availability.replaceAll('_', ' ')}.
        </Alert>
      ) : (
        <Button disabled={busy} onClick={() => void open()}>
          Open {label}
        </Button>
      )}
      {busy && <CircularProgress aria-label="Authorizing evidence" />}
      {message && <Alert severity="info">{message}</Alert>}
      {value &&
        (reference.kind === 'image' ? (
          <Box
            component="img"
            src={value.url}
            alt={'Reported ' + label}
            referrerPolicy="no-referrer"
            sx={{ maxWidth: '100%', maxHeight: 560, objectFit: 'contain' }}
            onError={() => {
              setValue(null);
              setMessage('The protected image could not load.');
            }}
          />
        ) : (
          <Box
            component="video"
            src={value.url}
            controls
            preload="metadata"
            sx={{ maxWidth: '100%', maxHeight: 560 }}
            onError={() => {
              setValue(null);
              setMessage('The protected video could not load.');
            }}
          />
        ))}
    </Stack>
  );
}
export function ProtectedEvidence({
  controller,
  references,
  restricted,
  title,
  description,
}: {
  controller: EmployeeSessionController;
  references: EvidenceReference[];
  restricted: boolean;
  title: string;
  description: string;
}) {
  if (!references.length) return null;
  return (
    <RecordSection title={title}>
      <Typography sx={{ mb: 2 }}>{description}</Typography>
      <Stack sx={{ gap: 3 }}>
        {references.map((reference, index) => (
          <EvidenceItem
            key={JSON.stringify(reference) + index}
            controller={controller}
            reference={reference}
            restricted={restricted}
          />
        ))}
      </Stack>
    </RecordSection>
  );
}
