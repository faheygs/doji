// Hosted invitation completion is NOT portal authentication. Never exchange an
// unbound authorization code, grant a role, or infer identity from query data.
export function employeeSetupReturn(request) {
  const url = new URL(request.url);
  if (url.origin !== 'https://admin.dojipro.com' || url.pathname !== '/identity/setup-complete') return null;
  const headers = new Headers({
    'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status:405,headers});
  // Drop short-lived provider codes without rendering, storing or forwarding them.
  if (url.search) { headers.set('location',url.origin+url.pathname); return new Response(null,{status:303,headers}); }
  headers.set('content-type','text/html; charset=utf-8');
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Employee setup · Doji</title><script src="/identity/setup-return.js"></script><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/portal.css"><link rel="stylesheet" href="/admin-portal/admin.css"></head><body class="portalPage adminPortalPage"><main class="portalAuth"><section class="authStory adminAuthStory"><a class="portalBrand" href="/"><img src="/assets/doji-icon.png" alt=""><span>Doji<small>Admin</small></span></a><div class="authCopy"><p class="eyebrow">Separate employee account</p><h1>Employee setup</h1><p>Your member-app login and password are unchanged.</p></div></section><section class="authPanel"><div class="authCard"><p class="eyebrow">Account verification</p><h2>You have returned to Doji</h2><p>Your administrator will verify your separate employee account before enabling portal access.</p><p>You can close this page and let your administrator know you finished setup.</p><div class="authHint">Returning here does not grant employee access or sign you into the admin portal.</div></div></section></main></body></html>';
  return new Response(request.method==='HEAD'?null:html,{status:200,headers});
}
