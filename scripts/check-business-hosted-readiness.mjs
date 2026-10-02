// Read-only release-gate observation. No deployment, signup, provider mail or data mutation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { cf, hash } from './prepare-safety-launch.mjs';
const result = { at: new Date().toISOString(), business: {}, admin: {}, checks: [] };
for (const [key, name] of [
  ['business', 'doji-business'],
  ['admin', 'doji-admin'],
]) {
  let project;
  try {
    project = await cf(`/pages/projects/${name}`);
  } catch {
    result[key] = { project: name, metadata: 'Unavailable: authenticated read did not succeed' };
    continue;
  }
  result[key] = {
    project: name,
    deploymentId: project.canonical_deployment?.id,
    status: project.canonical_deployment?.latest_stage?.status,
    usesFunctions: project.canonical_deployment?.uses_functions,
  };
}
if (result.business.deploymentId) {
  const domains = await cf('/pages/projects/doji-business/domains');
  result.business.domainStatus = domains.find((d) => d.name === 'business.dojipro.com')?.status;
}
for (const path of [
  '/',
  '/business-portal/access/',
  '/business-portal/application/',
  '/business-terms/',
  '/business-privacy/',
]) {
  const response = await fetch(`https://business.dojipro.com${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  result.checks.push({
    path,
    status: response.status,
    location: response.headers.get('location'),
    sha256: hash(body),
  });
  if (path === '/') {
    result.business.connectionsBlocked = (
      response.headers.get('content-security-policy') || ''
    ).includes("connect-src 'none'");
    result.business.formsBlocked = (response.headers.get('content-security-policy') || '').includes(
      "form-action 'none'",
    );
    result.business.hasSignupForm = /<form[\s>]/i.test(body);
  }
}
if (result.business.deploymentId) {
  assert.equal(result.business.domainStatus, 'active');
  assert.equal(result.business.usesFunctions, false);
}
assert.equal(result.business.connectionsBlocked, true);
assert.equal(result.business.formsBlocked, true);
assert.equal(result.business.hasSignupForm, false);
assert.deepEqual(
  result.checks.map((row) => row.status),
  [200, 302, 302, 404, 404],
);
result.conclusion =
  'Public closed page and route gates verified; authenticated metadata may be unavailable as reported. This is not hosted Auth/provider-delivery qualification.';
await mkdir('test-results/business-privacy-20260930', { recursive: true });
await writeFile(
  'test-results/business-privacy-20260930/hosted-readiness.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
