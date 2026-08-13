let offsetMilliseconds = 0;
let synchronized = false;

/** Synchronize display timers to the authoritative database clock. */
export function syncServerClock(serverNowIso: string): void {
  const serverMilliseconds = new Date(serverNowIso).getTime();
  if (!Number.isFinite(serverMilliseconds)) return;
  offsetMilliseconds = serverMilliseconds - Date.now();
  synchronized = true;
}

export function serverNowMs(): number {
  return Date.now() + offsetMilliseconds;
}

export function hasServerClock(): boolean {
  return synchronized;
}

export function resetServerClock(): void {
  offsetMilliseconds = 0;
  synchronized = false;
}
