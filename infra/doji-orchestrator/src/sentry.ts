type SentryContextValue = string | number | boolean | null | undefined;

function endpointForDsn(dsn: string): { endpoint: string; publicKey: string } | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

export async function captureWorkerException(
  dsn: string | undefined,
  operation: string,
  error: unknown,
  context: Record<string, SentryContextValue> = {},
): Promise<void> {
  const target = dsn ? endpointForDsn(dsn) : null;
  if (!target) return;

  const eventId = crypto.randomUUID().replaceAll('-', '');
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: now }),
    JSON.stringify({ type: 'event', content_type: 'application/json' }),
    JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      logger: 'doji.orchestrator',
      message: { formatted: message.slice(0, 1_000) },
      tags: { runtime: 'cloudflare-worker', operation },
      extra: context,
    }),
  ].join('\n');

  try {
    const response = await fetch(target.endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7,sentry_key=${target.publicKey}`,
      },
      body: envelope,
    });
    if (!response.ok) console.error('Sentry envelope rejected', response.status);
  } catch (captureError) {
    console.error('Sentry capture failed', captureError);
  }
}
