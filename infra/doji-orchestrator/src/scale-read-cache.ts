export function scaleReadCache(): Cache {
  return (caches as CacheStorage & { default: Cache }).default;
}

export function forScaleReadClient(
  response: Response,
  cache: string,
  durationMs: number,
): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('server-timing', `scale-read;dur=${durationMs}`);
  headers.set('x-doji-scale-cache', cache);
  return new Response(response.body, { status: response.status, headers });
}

export async function storeScaleReadResponse(
  cacheKey: Request,
  response: Response,
  route: string,
  context?: ExecutionContext,
): Promise<void> {
  const cacheWrite = scaleReadCache()
    .put(cacheKey, response.clone())
    .catch((error) => {
      console.error(
        JSON.stringify({
          event: 'scale_read_cache_error',
          route,
          message: error instanceof Error ? error.message : 'Cache write failed',
        }),
      );
    });
  if (context) context.waitUntil(cacheWrite);
  else await cacheWrite;
}
