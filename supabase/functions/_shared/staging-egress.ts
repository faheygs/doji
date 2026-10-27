import { readJsonBody } from './json-body.ts';

type StagingEmail = { key: string; from: string; recipients: string[] };
type StagingConnections = {
  projectUrl?: string;
  orchestratorUrl?: string;
  ablyKey?: string;
  email?: StagingEmail;
};

/** Explicit server configuration only; never accept destinations from a caller. */
export function stagingEmailPolicy(key?: string, from?: string, recipients?: string): StagingEmail {
  let addresses: unknown;
  try {
    addresses = JSON.parse(recipients || 'null');
  } catch {
    throw Error('Staging email configuration rejected');
  }
  const mailbox = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (
    !key ||
    !from ||
    !/^Doji Staging <[^<>\s]+>$/.test(from) ||
    !mailbox.test(from.slice(14, -1)) ||
    !Array.isArray(addresses) ||
    addresses.length < 1 ||
    addresses.length > 5 ||
    addresses.some((value) => typeof value !== 'string' || !mailbox.test(value))
  )
    throw Error('Staging email configuration rejected');
  return { key, from, recipients: addresses };
}

/** Installed only by the staging packager, before loading unchanged handlers. */
export function stagingFetch(config: StagingConnections, upstream: typeof fetch): typeof fetch {
  const project = 'https://ohrcupagdoilkwhecict.supabase.co';
  const orchestrator = 'https://doji-orchestrator-staging.faheygs.workers.dev';
  if (
    config.projectUrl !== project ||
    config.orchestratorUrl !== orchestrator ||
    !config.ablyKey?.startsWith('eVKl2g.')
  ) {
    throw new Error('Staging connections rejected');
  }
  const ablyHosts = new Set([
    'rest.ably.io',
    'main.realtime.ably.net',
    ...['a', 'b', 'c', 'd', 'e'].map((region) => `main.${region}.fallback.ably-realtime.com`),
  ]);
  const authorization = `Basic ${btoa(config.ablyKey)}`;
  const email =
    config.email &&
    stagingEmailPolicy(
      config.email.key,
      config.email.from,
      JSON.stringify(config.email.recipients),
    );
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const ably = url.protocol === 'https:' && !url.port && ablyHosts.has(url.hostname);
    if (
      email &&
      url.href === 'https://api.resend.com/emails' &&
      request.method === 'POST' &&
      request.headers.get('authorization') === `Bearer ${email.key}` &&
      request.headers.get('content-type') === 'application/json' &&
      /^staging\/[\w/:-]{1,240}$/.test(request.headers.get('idempotency-key') || '')
    ) {
      const body = await readJsonBody<Record<string, unknown>>(request.clone(), 131072);
      if (
        body &&
        Object.keys(body).every((key) => ['from', 'to', 'subject', 'html', 'text'].includes(key)) &&
        body.from === email.from &&
        Array.isArray(body.to) &&
        body.to.length === 1 &&
        email.recipients.includes(body.to[0]) &&
        typeof body.subject === 'string' &&
        body.subject.startsWith('[STAGING] ') &&
        typeof body.html === 'string' &&
        typeof body.text === 'string' &&
        !/https:\/\/admin\.dojipro\.com(?:[\/"\s]|$)/i.test(body.html + body.text)
      )
        return upstream(new Request(request, { redirect: 'error' }));
      throw Error('Staging email destination or content denied');
    }
    const allowed =
      !url.username &&
      !url.password &&
      (url.origin === project ||
        url.origin === orchestrator ||
        (ably &&
          (request.headers.get('authorization') === authorization ||
            (url.pathname === '/time' &&
              request.method === 'GET' &&
              !url.search &&
              !request.headers.has('authorization')))));
    if (!allowed) throw new Error('Staging outbound destination denied');
    // An allowed service must not redirect a credential-bearing request elsewhere.
    return upstream(new Request(request, { redirect: 'error' }));
  };
}
