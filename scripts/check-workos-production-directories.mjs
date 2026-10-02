// Read-only bounded preflight. Never emits users, credentials or provider bodies.
import { readFileSync } from 'node:fs';
import { boundedBody } from '../infra/portal-identity-candidate/bounded-body.mjs';
if (!process.argv.includes('--read-production')) {
  console.log('No network requests. Pass --read-production for four bounded directory/key checks.');
  process.exit(0);
}
const expected = {
  employee: ['environment_01M3VE4WMDRZ1VBVS5MNVVF19J', 'client_01M3VE4WTBYS2XN6NZPH9EDMQD'],
  business: ['environment_01M3T5131BPKBR7F6P2MAG6SBJ', 'client_01M3T51363MDZZK6X8DB7NS32N'],
};
try {
  const config = JSON.parse(readFileSync('.artifacts/workos-production/credentials.json', 'utf8'));
  if (
    config.productionOnly !== true ||
    config.enabled !== false ||
    config.employee?.apiKey === config.business?.apiKey
  )
    throw Error();
  for (const [realm, [environment, clientId]] of Object.entries(expected)) {
    const value = config[realm];
    if (
      value?.environment !== environment ||
      value.clientId !== clientId ||
      !/^sk_[A-Za-z0-9_-]{20,256}$/.test(value.apiKey || '')
    )
      throw Error();
    const signal = AbortSignal.timeout(10000);
    const response = await fetch('https://api.workos.com/user_management/users?limit=1', {
      headers: { Authorization: `Bearer ${value.apiKey}`, Accept: 'application/json' },
      redirect: 'error',
      signal,
    });
    if (!response.ok || !response.body) throw Error();
    const data = JSON.parse(
      new TextDecoder().decode(await boundedBody(response.body, signal, 65536)),
    );
    if (!Array.isArray(data.data) || data.data.length > 1) throw Error();
    const publicSignal = AbortSignal.timeout(10000);
    const publicKeys = await fetch(`https://api.workos.com/sso/jwks/${clientId}`, {
      redirect: 'error',
      signal: publicSignal,
    });
    if (!publicKeys.ok || !publicKeys.body) throw Error();
    const jwks = JSON.parse(
      new TextDecoder().decode(await boundedBody(publicKeys.body, publicSignal, 65536)),
    );
    if (
      !Array.isArray(jwks.keys) ||
      !jwks.keys.length ||
      jwks.keys.length > 5 ||
      jwks.keys.some((k) => k.d || k.k || k.p || k.q)
    )
      throw Error();
    console.log(
      JSON.stringify({
        realm,
        environment,
        clientId,
        authenticatedRead: 'passed',
        userCountOnBoundedPage: data.data.length,
        publicSigningKeyCount: jwks.keys.length,
        integrationEnabled: false,
      }),
    );
  }
} catch {
  console.error('Production directory preflight failed; no secrets or user details emitted.');
  process.exitCode = 1;
}
