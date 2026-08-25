import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createRequestSignal } from '../lib/requestSignal';

/** Matches settings save validation (DB allows up to 30; client caps at 20). */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export type UsernameAvailabilityStatus =
  | 'idle'
  | 'unchanged'
  | 'invalid'
  | 'checking'
  | 'available'
  | 'taken'
  | 'error';

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

type Options = {
  /**
   * When the normalized value matches this profile username, skip the network
   * (settings: user did not change handle).
   */
  treatAsUnchangedIfMatches?: string;
  /** Ignore a profile row with this id when checking conflicts (current user). */
  ownUserId?: string;
  debounceMs?: number;
};

export function useUsernameAvailability(input: string, options: Options = {}) {
  const { treatAsUnchangedIfMatches, ownUserId, debounceMs = 300 } = options;

  const normalized = useMemo(() => normalizeUsernameInput(input), [input]);
  const unchangedBaseline = useMemo(() => {
    if (treatAsUnchangedIfMatches == null || treatAsUnchangedIfMatches === '') return null;
    return normalizeUsernameInput(treatAsUnchangedIfMatches);
  }, [treatAsUnchangedIfMatches]);

  const [status, setStatus] = useState<UsernameAvailabilityStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const reqRef = useRef(0);
  /** Handles we already know are taken this session — instant message when re-typed. */
  const knownTakenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!input.trim()) {
      setStatus('idle');
      setErrorMessage('');
      return;
    }

    if (unchangedBaseline != null && normalized === unchangedBaseline) {
      setStatus('unchanged');
      setErrorMessage('');
      return;
    }

    if (!USERNAME_RE.test(normalized)) {
      setStatus('invalid');
      setErrorMessage(
        'Use 3–20 characters: lowercase letters, numbers, and underscores only.',
      );
      return;
    }

    if (knownTakenRef.current.has(normalized)) {
      setStatus('taken');
      setErrorMessage('That username is already taken.');
      return;
    }

    setStatus('checking');
    setErrorMessage('');

    const req = ++reqRef.current;
    const request = createRequestSignal(undefined, 6_000);
    const timer = setTimeout(async () => {
      let data: boolean | null = null;
      let error: { message: string } | null = null;
      try {
        const result = await supabase.rpc('is_username_available', {
          p_username: normalized,
        }).abortSignal(request.signal);
        data = result.data;
        error = result.error;
      } catch (requestError) {
        if (request.signal.aborted) return;
        error = {
          message: requestError instanceof Error ? requestError.message : 'Username check failed',
        };
      } finally {
        request.cleanup();
      }

      if (req !== reqRef.current) return;

      if (error) {
        if (__DEV__) console.warn('[useUsernameAvailability]', error.message);
        setStatus('error');
        setErrorMessage('Could not check username. Try again.');
        return;
      }

      const conflict = data !== true;
      if (conflict) {
        knownTakenRef.current.add(normalized);
        setStatus('taken');
        setErrorMessage('That username is already taken.');
      } else {
        knownTakenRef.current.delete(normalized);
        setStatus('available');
        setErrorMessage('');
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      request.cancel(new Error('Username changed'));
    };
  }, [input, normalized, unchangedBaseline, ownUserId, debounceMs]);

  const isOkForSubmit = Boolean(
    input.trim() && (status === 'unchanged' || status === 'available'),
  );

  return {
    normalized,
    status,
    errorMessage,
    isOkForSubmit,
    isChecking: status === 'checking',
  };
}
