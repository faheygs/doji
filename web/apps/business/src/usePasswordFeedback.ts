import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  businessPasswordMinimum,
  businessPasswordMaximum,
} from '../../../../infra/portal-identity-candidate/business-password-policy.mts';

export interface PasswordFeedback {
  length: boolean;
  excludesEmail: boolean;
  strength: 'waiting' | 'checking' | 'weak' | 'strong' | 'unavailable';
}
const empty: PasswordFeedback = { length: false, excludesEmail: false, strength: 'waiting' };

export function usePasswordFeedback(input: RefObject<HTMLInputElement | null>) {
  const [feedback, setFeedback] = useState(empty);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function clear() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    setFeedback(empty);
  }
  function refresh(email = '') {
    const current = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    const value = input.current?.value ?? '';
    const normalizedEmail = email.trim().toLowerCase();
    const length =
      value.length >= businessPasswordMinimum && value.length <= businessPasswordMaximum;
    const excludesEmail = Boolean(
      value && normalizedEmail && !value.toLowerCase().includes(normalizedEmail),
    );
    setFeedback({ length, excludesEmail, strength: length ? 'checking' : 'waiting' });
    if (!length) return;
    // Debounce a local computation, not a server poll. Read the current DOM field
    // after loading; don't capture passwords in delayed work or React state.
    timer.current = setTimeout(() => {
      void import('./password-strength')
        .then(({ passwordStrength }) => {
          if (generation.current !== current || !input.current) return;
          const strong = passwordStrength(input.current.value, normalizedEmail);
          setFeedback({ length, excludesEmail, strength: strong ? 'strong' : 'weak' });
        })
        .catch(() => {
          if (generation.current === current)
            setFeedback({ length, excludesEmail, strength: 'unavailable' });
        });
    }, 200);
  }
  return { feedback, refresh, clear };
}
