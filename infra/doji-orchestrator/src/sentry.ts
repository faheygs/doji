type SentryContextValue = string | number | boolean | null | undefined;

type SentryTarget = {
  dsn: string;
  endpoint: string;
};

function endpointForDsn(dsn: string): SentryTarget | null {
  try {
    const url = new URL(dsn);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const projectId = pathParts.pop();
    if (!url.username || !projectId) return null;

    const basePath = pathParts.length ? `/${pathParts.join('/')}` : '';
    const endpoint = new URL(`${basePath}/api/${projectId}/envelope/`, url.origin);
    endpoint.searchParams.set('sentry_version', '7');
    endpoint.searchParams.set('sentry_key', url.username);
    endpoint.searchParams.set('sentry_client', 'doji-orchestrator/1.0.0');

    return {
      dsn,
      endpoint: endpoint.toString(),
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
  const event = JSON.stringify({
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    logger: 'doji.orchestrator',
    message: { formatted: message.slice(0, 1_000) },
    tags: { runtime: 'cloudflare-worker', operation },
    extra: context,
    sdk: { name: 'doji-orchestrator', version: '1.0.0' },
  });
  const envelope = [
    JSON.stringify({
      event_id: eventId,
      sent_at: now,
      dsn: target.dsn,
      sdk: { name: 'doji-orchestrator', version: '1.0.0' },
    }),
    JSON.stringify({
      type: 'event',
      content_type: 'application/json',
      length: new TextEncoder().encode(event).byteLength,
    }),
    event,
  ].join('\n');

  try {
    const response = await fetch(target.endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
      headers: {
        'content-type': 'application/x-sentry-envelope',
      },
      body: envelope,
    });
    if (!response.ok) console.error('Sentry envelope rejected', response.status);
  } catch (captureError) {
    console.error('Sentry capture failed', captureError);
  }
}
