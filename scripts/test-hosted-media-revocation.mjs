// Owner-approved, tiny synthetic fixture only. No member content or configuration.
// No transformations (their unused allowance has not been reverified). Never retry
// this run automatically; inspect its cleanup journal after any uncertain outcome.
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {randomUUID, createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ref = 'tvixsmqxotuvyjqzmjla', origin = `https://${ref}.supabase.co`;
const runId = randomUUID(), root = `test-results/hosted-media-revocation-${runId}`;
const paths = ['avatars', 'post-media'].map(bucket => ({bucket, path: `safety-release-canary/${runId}/fixture.jpg`}));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const records = [];
async function main() {
  assert.equal(process.argv[2], '--synthetic-canary-only');
  assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), ref);
  await mkdir(root, {recursive: true});
  await writeFile(`${root}/cleanup-journal.json`, JSON.stringify({runId, project: ref, paths, state: 'planned'}, null, 2), {flag: 'wx'});
  let keys;
  try {
    const output = execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output-format', 'json'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000});
    keys = JSON.parse(output.slice(output.indexOf('{'))).keys;
  } catch { throw new Error('Existing CLI authentication unavailable; no credential output retained'); }
  const service = keys.find(k => k.type === 'secret' && k.name === 'default')?.api_key;
  assert.ok(service?.startsWith('sb_secret_'));
  // Generate four neutral pixels in memory, not a user image or downloaded asset.
  const pixels = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Drawing; $fixtureBitmap = New-Object System.Drawing.Bitmap 2,2; $fixtureStream = New-Object System.IO.MemoryStream; try { $fixtureBitmap.Save($fixtureStream, [System.Drawing.Imaging.ImageFormat]::Jpeg); [Console]::Write([Convert]::ToBase64String($fixtureStream.ToArray())) } finally { $fixtureBitmap.Dispose(); $fixtureStream.Dispose() }'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000});
  const bytes = Buffer.from(pixels.trim(), 'base64');
  assert.ok(bytes.length > 10 && bytes.length < 4096 && bytes[0] === 255 && bytes[1] === 216);
  const api = (path, init = {}) => fetch(`${origin}/storage/v1/${path}`, {...init, headers: {apikey: service, 'content-type': 'application/json', ...init.headers}, signal: AbortSignal.timeout(15_000), redirect: 'error'});
  const observations = [];
  async function observe(label, url) {
    const response = await fetch(url, {signal: AbortSignal.timeout(15_000), redirect: 'error'});
    const data = Buffer.from(await response.arrayBuffer());
    assert.ok(data.length < 20_000, 'Fixture response bound');
    let error = {};
    if (!response.ok) {
      try { const v = JSON.parse(data.toString()); error = {code: v.code, error: v.error, statusCode: v.statusCode}; } catch {}
    }
    return {label, status: response.status, sha256: response.ok ? hash(data) : null, cfCacheStatus: response.headers.get('cf-cache-status'), ...error};
  }
  const remove = async item => {
    assert.ok(item.path === `safety-release-canary/${runId}/fixture.jpg` && ['avatars', 'post-media'].includes(item.bucket));
    const r = await api(`object/${item.bucket}`, {method: 'DELETE', body: JSON.stringify({prefixes: [item.path]})});
    assert.ok(r.ok, `Synthetic fixture cleanup ${item.bucket}: ${r.status}`);
    await r.body?.cancel();
  };
  try {
    for (const item of paths) {
      const bucket = await api(`bucket/${item.bucket}`), config = await bucket.json();
      assert.equal(bucket.status, 200);
      assert.equal(config.public, item.bucket === 'avatars', 'Existing bucket visibility unchanged');
      assert.ok(!config.allowed_mime_types || config.allowed_mime_types.includes('image/jpeg'), 'Existing JPEG allowance required');
      const upload = await api(`object/${item.bucket}/${item.path}`, {method: 'POST', headers: {'content-type': 'image/jpeg', 'cache-control': 'max-age=3600', 'x-upsert': 'false'}, body: bytes});
      assert.ok(upload.ok, `Synthetic fixture upload ${item.bucket}: ${upload.status}`);
      await upload.body?.cancel();
      const sign = await api(`object/sign/${item.bucket}/${item.path}`, {method: 'POST', body: JSON.stringify({expiresIn: 600})});
      assert.ok(sign.ok, 'Fixture signing');
      const signed = await sign.json();
      assert.ok(signed.signedURL?.startsWith(`/object/sign/${item.bucket}/${item.path}?`));
      const urls = [{label: `${item.bucket}:signed`, url: `${origin}/storage/v1${signed.signedURL}`}];
      if (item.bucket === 'avatars') urls.push({label: 'avatars:public', url: `${origin}/storage/v1/object/public/avatars/${item.path}`});
      for (const view of urls) {
        const first = await observe(view.label, view.url), warm = await observe(view.label, view.url);
        assert.equal(first.sha256, hash(bytes)); assert.equal(warm.sha256, hash(bytes));
        observations.push({...view, before: [first, warm]});
      }
    }
    for (const item of paths) await remove(item);
    const deletedAt = Date.now();
    for (const view of observations) view.immediate = await observe(view.label, view.url);
    console.log(JSON.stringify({phase: 'synthetic_sources_deleted', fixtureBytes: bytes.length, checks: observations.length, evidence: root, next: 'Recheck identical warmed URLs after the CDN propagation interval; no signed URLs logged.'}));
    // Tool invocation yields while this timer runs; main agent can continue work.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, deletedAt + 75_000 - Date.now())));
    for (const view of observations) {
      const after = await observe(view.label, view.url);
      records.push({label: view.label, before: view.before, immediate: view.immediate, after});
      assert.ok([400, 404].includes(after.status) && (after.code === 'NoSuchKey' || after.error === 'not_found' || String(after.statusCode) === '404'), `Old URL revocation not confirmed for ${view.label}`);
    }
    await writeFile(`${root}/verified.json`, JSON.stringify({at: new Date().toISOString(), runId, fixtureBytes: bytes.length, records, waitSeconds: 75, scope: 'Observed CDN path only; no transformed images, global propagation guarantee, browser-cache recall, staff evidence or appeal qualification.'}, null, 2), {flag: 'wx'});
    console.log(JSON.stringify({result: 'warmed_public_and_signed_fixture_URLs_revoked', evidence: root, scope: 'one observed network location; transformations not tested'}));
  } finally {
    const cleanup = [];
    for (const item of paths) {
      try { await remove(item); cleanup.push({...item, removed: true}); } catch { cleanup.push({...item, removed: false}); }
    }
    await writeFile(`${root}/cleanup-result.json`, JSON.stringify({at: new Date().toISOString(), cleanup}, null, 2), {flag: 'wx'});
    assert.ok(cleanup.every(v => v.removed), `Synthetic fixture cleanup requires attention; see ${root}`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
