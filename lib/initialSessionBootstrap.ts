import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type SessionLoader = () => Promise<Session | null>;

export type SessionBootstrapObserver = {
  onSession: (session: Session | null) => void;
  onError: (error: unknown) => void;
  onTimeout: () => void;
};

/**
 * Supabase restores its persisted session behind an internal auth lock. Startup
 * consumers must share that work; concurrent getSession calls can otherwise queue
 * behind the same stalled lock and keep the app on its native splash indefinitely.
 */
export function createInitialSessionBootstrap(loadSession: SessionLoader) {
  let inFlight: Promise<Session | null> | null = null;

  return {
    get(): Promise<Session | null> {
      if (inFlight) return inFlight;

      const request = Promise.resolve().then(loadSession);
      inFlight = request;
      void request.catch(() => {
        // A real failure may be retried. A merely slow request remains shared so a
        // retry cannot create another waiter behind the same Supabase auth lock.
        if (inFlight === request) inFlight = null;
      });
      return request;
    },
  };
}

export function observeSessionBootstrap(
  request: Promise<Session | null>,
  timeoutMs: number,
  observer: SessionBootstrapObserver,
) {
  let active = true;
  const timeout = setTimeout(() => {
    if (active) observer.onTimeout();
  }, timeoutMs);

  void request.then(
    (session) => {
      clearTimeout(timeout);
      if (active) observer.onSession(session);
    },
    (error: unknown) => {
      clearTimeout(timeout);
      if (active) observer.onError(error);
    },
  );

  return () => {
    active = false;
    clearTimeout(timeout);
  };
}

export const initialSessionBootstrap = createInitialSessionBootstrap(async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
});
