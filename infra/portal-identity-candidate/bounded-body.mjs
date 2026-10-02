// Server-side candidate transport helper. A stalled stream or cancellation must
// not keep a request alive after its deadline. No payload content enters errors.
export async function boundedBody(stream, signal, limit) {
  signal.throwIfAborted();
  const reader = stream?.getReader();
  if (!reader) throw Error('Missing response body');
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(Error('Request interrupted'));
  signal.addEventListener('abort', onAbort, { once: true });
  const chunks = [];
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
