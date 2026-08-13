import { useEffect, useRef, useState } from 'react';
import { serverNowMs } from '../lib/serverClock';
import { parseDate } from '../utils/time';

type Options = {
  enabled?: boolean;
  onExpire?: () => void;
};

/** Display-only countdown derived from the synchronized server clock every tick. */
export function useServerCountdown(
  expiresAt: string | null | undefined,
  { enabled = true, onExpire }: Options = {},
): number {
  const onExpireRef = useRef(onExpire);
  const expiryNotifiedRef = useRef(false);
  const calculate = () => {
    if (!enabled || !expiresAt) return 0;
    return Math.max(0, Math.ceil((parseDate(expiresAt).getTime() - serverNowMs()) / 1000));
  };
  const [remaining, setRemaining] = useState(calculate);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expiryNotifiedRef.current = false;
    const tick = () => {
      const next = calculate();
      setRemaining(next);
      if (next === 0 && expiresAt && !expiryNotifiedRef.current) {
        expiryNotifiedRef.current = true;
        onExpireRef.current?.();
      }
    };

    tick();
    if (!enabled || !expiresAt) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [enabled, expiresAt]);

  return remaining;
}
