'use client';
import { useEffect, useState } from 'react';
import { Alert, Box } from '@mui/material';

// Keep the reviewed receipt/idempotency controller as a DOM island. Navigation
// into/out of this sensitive form is document navigation, not a persisted SPA view.
const dependencies = new Map<string, Promise<void>>();
function loadScript(src: string) {
  let task = dependencies.get(src);
  if (!task) {
    task = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => {
        dependencies.delete(src);
        reject(Error('Form unavailable'));
      };
      document.head.append(script);
    });
    dependencies.set(src, task);
  }
  return task;
}
export function SafetyForm({ content }: { content: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        for (const src of [
          '/safety-removal/config.js',
          '/legacy-safety/portal-select.js',
          '/legacy-safety/taxonomy.js',
        ]) {
          await loadScript(src);
          if (!active) return;
        }
        await loadScript('/legacy-safety/form.js');
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <link rel="stylesheet" href="/legacy-safety/styles.css" />
      <link rel="stylesheet" href="/legacy-safety/portal.css" />
      <link rel="stylesheet" href="/legacy-safety/safety.css" />
      {failed && (
        <Alert severity="error">
          The request form could not load. Contact support@dojipro.com with request details, not
          images.
        </Alert>
      )}
      <Box className="safetyPage safetyShell" dangerouslySetInnerHTML={{ __html: content }} />
    </>
  );
}
