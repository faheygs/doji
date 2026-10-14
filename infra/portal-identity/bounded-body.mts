// Server-side candidate transport helper. A stalled stream or cancellation must
// not keep a request alive after its deadline. No payload content enters errors.
export async function boundedBody(
  stream: ReadableStream<Uint8Array> | null | undefined,
  signal: AbortSignal,
  limit: number,
): Promise<Uint8Array> {
  signal.throwIfAborted();
  const reader = stream?.getReader();
  if (!reader) throw Error('Missing response body');
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(Error('Request interrupted'));
  signal.addEventListener('abort', onAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const part = await Promise.race([reader.read(), aborted]);
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw Object.assign(Error('Request too large'), { status: 413 });
      chunks.push(part.value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    // Cancellation may itself stall (including a cloned request's tee branch).
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
