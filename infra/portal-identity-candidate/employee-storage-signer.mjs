import { boundedBody } from './bounded-body.mjs';
import { validEvidence } from './employee-resources.mjs';
// For the isolated server function only. Never give this key to Pages/browser,
// use it for generic SQL, or accept an arbitrary storage URL from the caller.
export function createEmployeeStorageSigner({ origin, serviceKey }, upstream = fetch) {
  if (
    !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin) ||
    typeof serviceKey !== 'string' ||
    serviceKey.length < 30
  )
    throw Error('Evidence signer unavailable');
  return async ({ bucket, path, expiresIn }, callerSignal) => {
    if (!validEvidence(bucket, path) || expiresIn !== 300)
      throw Error('Invalid evidence reference');
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(5000)]);
    const response = await upstream(
      `${origin}/storage/v1/object/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'content-type': 'application/json',
        },
        body: '{"expiresIn":300}',
      },
    );
    if (!response.ok) throw Error('Evidence signing unavailable');
    const result = JSON.parse(
      new TextDecoder().decode(await boundedBody(response.body, signal, 8192)),
    );
    if (
      typeof result.signedURL !== 'string' ||
      !result.signedURL.startsWith(`/object/sign/${bucket}/`)
    )
      throw Error('Invalid signing response');
    return origin + '/storage/v1' + result.signedURL;
  };
}
