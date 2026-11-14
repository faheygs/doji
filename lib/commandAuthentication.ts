import {
  abortRegistration,
  awaitRegistration,
  registrationAbortReason,
} from './pushRegistrationCancellation';

class CommandAuthenticationTimeout extends Error {
  readonly code = 'DOJI_COMMAND_AUTH_TIMEOUT';
  constructor() {
    super('Authentication took too long. Please try again.');
  }
}

/** Bound the caller, not Supabase's shared session lifecycle; never retry a write here. */
export async function awaitCommandAuthentication<T>(
  work: PromiseLike<T>,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const deadlineAt = Date.now() + 8_000;
  const fromParent = () => {
    if (parent) abortRegistration(controller, registrationAbortReason(parent));
  };
  const timer = setTimeout(
    () => abortRegistration(controller, new CommandAuthenticationTimeout()),
    8_000,
  );
  parent?.addEventListener('abort', fromParent, { once: true });
  if (parent?.aborted) fromParent();
  try {
    const result = await awaitRegistration(work, controller.signal);
    if (Date.now() >= deadlineAt) throw new CommandAuthenticationTimeout();
    return result;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', fromParent);
  }
}
