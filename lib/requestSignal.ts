export function createRequestSignal(parent?: AbortSignal, timeoutMs = 8_000) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason);

  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener('abort', abortFromParent, { once: true });

  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abortFromParent);
    },
  };
}
