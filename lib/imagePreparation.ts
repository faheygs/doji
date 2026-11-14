const DEADLINE_MS = 15_000;
const NATIVE_LIMIT = 2;
const WAITING_LIMIT = 4;

class ImagePreparationError extends Error {
  constructor(readonly code: 'DOJI_IMAGE_PREPARATION_TIMEOUT' | 'DOJI_IMAGE_PREPARATION_BUSY') {
    super(code === 'DOJI_IMAGE_PREPARATION_TIMEOUT'
      ? 'Preparing this photo took too long. Please try again.'
      : 'Other photos are still being prepared. Please try again shortly.');
  }
}

/** Native image work cannot be cancelled. Expiring its observer must not free its slot. */
export function createImagePreparationQueue() {
  let active = 0;
  const waiting: { start: () => void }[] = [];
  const drain = () => {
    while (active < NATIVE_LIMIT && waiting.length) waiting.shift()!.start();
  };
  return <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= NATIVE_LIMIT && waiting.length >= WAITING_LIMIT) {
      return Promise.reject(new ImagePreparationError('DOJI_IMAGE_PREPARATION_BUSY'));
    }
    const deadline = Date.now() + DEADLINE_MS;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (ok: boolean, value: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) resolve(value as T); else reject(value);
      };
      const expired = () => {
        finish(false, new ImagePreparationError('DOJI_IMAGE_PREPARATION_TIMEOUT'));
        const index = waiting.indexOf(job);
        if (index >= 0) waiting.splice(index, 1);
      };
      const job = { start: () => {
        if (settled || Date.now() >= deadline) { expired(); return; }
        active += 1;
        void Promise.resolve().then(() => {
          if (settled || Date.now() >= deadline) throw new ImagePreparationError('DOJI_IMAGE_PREPARATION_TIMEOUT');
          return work();
        }).then(
          (result) => { if (Date.now() >= deadline) expired(); else finish(true, result); },
          (error: unknown) => { if (Date.now() >= deadline) expired(); else finish(false, error); },
        ).finally(() => {
          active -= 1;
          drain();
        });
      } };
      const timer = setTimeout(expired, DEADLINE_MS);
      waiting.push(job);
      drain();
    });
  };
}

export const prepareNativeImage = createImagePreparationQueue();
