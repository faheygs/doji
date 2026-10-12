/** Capture before React, session reads or the security widget. Never persist the token. */
export function captureOwnedResetLink(
  browser: Pick<Window, 'location' | 'history' | 'addEventListener'>,
  enabled: boolean,
  now = Date.now,
) {
  const url = new URL(browser.location.href);
  const reset =
    url.pathname === '/business-portal/access/' && url.searchParams.get('mode') === 'reset';
  let token = '';
  const expires = now() + 5 * 60 * 1000;
  if (
    reset ||
    (url.pathname === '/business-portal/access/' && (url.searchParams.has('token') || url.hash))
  ) {
    const fragment = new URLSearchParams(url.hash.slice(1));
    const values = fragment.getAll('token');
    if (
      reset &&
      enabled &&
      url.origin === 'https://business.dojipro.com' &&
      url.searchParams.getAll('mode').length === 1 &&
      [...url.searchParams.keys()].every((key) => key === 'mode') &&
      [...fragment.keys()].every((key) => key === 'token') &&
      values.length === 1 &&
      /^[\x21-\x7e]{20,8192}$/.test(values[0]!)
    )
      token = values[0]!;
    // Replace, never push: neither the token nor arbitrary redirect parameters survive.
    try {
      browser.history.replaceState(
        null,
        '',
        reset ? '/business-portal/access/?mode=reset' : url.pathname,
      );
    } catch {
      token = '';
      throw Error('Unable to safely open business access.');
    }
  }
  const clear = () => {
    token = '';
  };
  browser.addEventListener('pagehide', clear);
  return {
    available: () => {
      if (now() >= expires) clear();
      return Boolean(token);
    },
    take() {
      const value = now() < expires ? token : '';
      clear();
      return value;
    },
    clear,
  };
}
