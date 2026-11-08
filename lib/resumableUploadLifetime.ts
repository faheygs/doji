import type { Upload } from 'tus-js-client';
import { abortRegistration, awaitRegistration } from './pushRegistrationCancellation';

class UploadStalled extends Error {
  readonly code = 'DOJI_UPLOAD_STALLED';
  constructor() {
    super('Upload stopped making progress. Please retry to resume it.');
  }
}

/** Preparation is read-only; a late result must not begin a transfer. */
export async function awaitUploadPreparation<T>(work: PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const deadline = Date.now() + 12_000;
  const failure = new Error('Media preparation took too long. Please try again.');
  const timer = setTimeout(() => abortRegistration(controller, failure), 12_000);
  try {
    const result = await awaitRegistration(work, controller.signal);
    if (Date.now() >= deadline) throw failure;
    return result;
  } finally {
    clearTimeout(timer);
  }
}

type Transfer = Pick<
  Upload,
  'findPreviousUploads' | 'resumeFromPreviousUpload' | 'start' | 'abort'
>;
type Callbacks = Pick<
  NonNullable<ConstructorParameters<typeof Upload>[1]>,
  'onProgress' | 'onError' | 'onSuccess'
>;

/** Bound lack of forward progress, not upload size. Never terminate the remote object. */
export function runResumableTransfer(
  create: (callbacks: Callbacks) => Transfer,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let upload: Transfer | undefined;
    let settled = false;
    let mostBytes = 0;
    let lastAdvance = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: unknown, success = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (success) resolve();
      else reject(error ?? new Error('Upload could not be completed.'));
    };
    const stall = () => {
      if (settled) return;
      finish(new UploadStalled());
      // Abort only this client attempt, keeping the fingerprint and remote offset.
      // Native abort itself may hang or reject; it must not hold the UI hostage.
      try {
        void upload?.abort(false).catch(() => {});
      } catch {
        /* Already settled locally. */
      }
    };
    const unavailable = () => {
      if (!settled && Date.now() - lastAdvance >= 60_000) stall();
      return settled;
    };
    timer = setTimeout(stall, 60_000);
    try {
      onProgress?.(0);
      upload = create({
        onProgress: (sent, total) => {
          if (unavailable()) return;
          if (Number.isFinite(sent) && sent > mostBytes) {
            mostBytes = sent;
            lastAdvance = Date.now();
            clearTimeout(timer);
            timer = setTimeout(stall, 60_000);
          }
          onProgress?.(
            Number.isFinite(total) && total > 0 && Number.isFinite(sent)
              ? Math.min(1, Math.max(0, sent / total))
              : 0,
          );
        },
        onError: (error) => finish(error),
        onSuccess: () => {
          if (!unavailable()) finish(undefined, true);
        },
      });
      const transfer = upload;
      void transfer
        .findPreviousUploads()
        .then((previous) => {
          if (unavailable()) return;
          const latest = previous.sort((a, b) => b.creationTime.localeCompare(a.creationTime))[0];
          if (latest) transfer.resumeFromPreviousUpload(latest);
          transfer.start();
        })
        .catch(finish);
    } catch (error) {
      finish(error);
    }
  });
}
