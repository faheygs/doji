const DEFAULT_MAX_BYTES = 16 * 1024;

async function readBodyText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('Request body is too large');
  }

  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error('Request body is too large');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return body;
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<T> {
  const body = await readBodyText(request, maxBytes);
  if (!body.trim()) throw new Error('Request body is required');
  return JSON.parse(body) as T;
}

export async function readOptionalJsonBody<T>(
  request: Request,
  fallback: T,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<T> {
  const body = await readBodyText(request, maxBytes);
  return body.trim() ? JSON.parse(body) as T : fallback;
}
