import type { Database } from '../types/database';
import { supabase } from './supabase';
import { commandError } from './commandGatewayTransport';
import type { CommandResult } from './commandGateway';
import {
  abortRegistration,
  awaitRegistration,
  checkRegistrationSignal,
  registrationAbortReason,
} from './pushRegistrationCancellation';

type Functions = Database['public']['Functions'];
class DirectCommandTimeout extends Error {
  readonly code = 'DOJI_COMMAND_TIMEOUT';
  constructor() {
    super('The command response timed out. Its outcome could not be confirmed.');
  }
}

/** Local-development transport only. A deadline never proves remote rollback. */
export async function directCommand<Name extends keyof Functions & string>(
  name: Name,
  args: Functions[Name]['Args'],
  token?: string,
  parent?: AbortSignal,
): Promise<CommandResult<Name>> {
  const controller = new AbortController();
  const deadlineAt = Date.now() + 12_000;
  const expired = () => abortRegistration(controller, new DirectCommandTimeout());
  const fromParent = () => {
    if (parent) abortRegistration(controller, registrationAbortReason(parent));
  };
  parent?.addEventListener('abort', fromParent, { once: true });
  if (parent?.aborted) fromParent();
  const timer = setTimeout(expired, 12_000);
  try {
    checkRegistrationSignal(controller.signal);
    let query = supabase.rpc(name, args as never);
    if (token) query = query.setHeader('Authorization', `Bearer ${token}`);
    const result = await awaitRegistration(query.abortSignal(controller.signal), controller.signal);
    // Native timers can resume after a network callback on foreground return.
    if (Date.now() >= deadlineAt) expired();
    checkRegistrationSignal(controller.signal);
    return result as unknown as CommandResult<Name>;
  } catch (error) {
    return {
      data: null,
      error: commandError(
        controller.signal.aborted ? registrationAbortReason(controller.signal) : error,
        'The command outcome could not be confirmed.',
      ),
    };
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', fromParent);
  }
}
