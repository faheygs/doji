type StagingConnections = {
  projectUrl?: string;
  orchestratorUrl?: string;
  ablyKey?: string;
};

/** Installed only by the staging packager, before loading unchanged handlers. */
export function stagingFetch(config: StagingConnections, upstream: typeof fetch): typeof fetch {
  const project = 'https://ohrcupagdoilkwhecict.supabase.co';
  const orchestrator = 'https://doji-orchestrator-staging.faheygs.workers.dev';
  if (config.projectUrl !== project || config.orchestratorUrl !== orchestrator ||
      !config.ablyKey?.startsWith('eVKl2g.')) {
    throw new Error('Staging connections rejected');
  }
  const ablyHosts = new Set([
    'rest.ably.io', 'main.realtime.ably.net',
    ...['a', 'b', 'c', 'd', 'e'].map(region => `main.${region}.fallback.ably-realtime.com`),
  ]);
  const authorization = `Basic ${btoa(config.ablyKey)}`;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const ably = url.protocol === 'https:' && !url.port && ablyHosts.has(url.hostname);
    const allowed = !url.username && !url.password && (
      url.origin === project || url.origin === orchestrator ||
      (ably && (request.headers.get('authorization') === authorization ||
        (url.pathname === '/time' && request.method === 'GET' && !url.search &&
          !request.headers.has('authorization'))))
    );
    if (!allowed) throw new Error('Staging outbound destination denied');
    // An allowed service must not redirect a credential-bearing request elsewhere.
    return upstream(new Request(request, { redirect: 'error' }));
  };
}
