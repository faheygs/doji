// Presentation only. The server independently enforces the exact test identity,
// one registration window or existing-account-only access. A URL never grants access.
export function businessAcceptance(
  until: string | undefined,
  mode: string | null,
  now = Date.now(),
  existingAccount = false,
) {
  const configured = until !== undefined || existingAccount === true;
  const expires = until === undefined ? NaN : Date.parse(until);
  const active =
    configured && Number.isFinite(expires) && expires > now && expires <= now + 7200000;
  return {
    configured,
    register: !existingAccount && active && mode === 'acceptance',
    access:
      (existingAccount === true && [null, 'signin', 'acceptance', 'reset'].includes(mode)) ||
      (active && (mode === 'acceptance' || mode === 'reset')),
  };
}
