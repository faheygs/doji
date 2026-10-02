import assert from 'node:assert/strict';
import {readFile,writeFile,cp} from 'node:fs/promises';
import vm from 'node:vm';
import {root,ref,inventory,save} from './prepare-safety-launch.mjs';
const before=JSON.parse(await readFile(`${root}/public-candidate.json`,'utf8'));
assert.deepEqual(await inventory(`${root}/public`),before.assets);
const form=await readFile('website/safety-removal/form.js','utf8');
for(const hostname of ['www.dojipro.com','doji-site.pages.dev','preview.doji-site.pages.dev']){
 let destination;vm.runInNewContext(form,{window:{DOJI_SAFETY_CONFIG:{enabled:true}},location:{hostname,replace:v=>destination=v}});
 assert.equal(destination,'https://dojipro.com/safety-removal/');
}
const turnstile=JSON.parse(await readFile(`${root}/turnstile-configured.json`,'utf8'));
assert.ok(turnstile.sitekey || turnstile.siteKey,'Recorded public site key required');
const config={enabled:true,endpoint:`https://${ref}.supabase.co/functions/v1/safety-removal`,siteKey:turnstile.sitekey||turnstile.siteKey};
await cp('website/safety-removal/form.js',`${root}/public/safety-removal/form.js`);
await writeFile(`${root}/public/safety-removal/config.js`,`window.DOJI_SAFETY_CONFIG = Object.freeze(${JSON.stringify(config)});\n`);
// Make discoverability links canonical even from the www hosting alias.
for(const asset of before.assets.filter(v=>v.path.endsWith('.html'))){
 const path=`${root}/public/${asset.path}`;const html=await readFile(path,'utf8');
 await writeFile(path,html.replaceAll('href="/safety-removal/"','href="https://dojipro.com/safety-removal/"'));
}
await save('public-live-candidate.json',{at:new Date().toISOString(),deploymentReady:true,enabled:true,assets:await inventory(`${root}/public`),canonicalOrigin:'https://dojipro.com',canonicalAliasTest:true});
console.log('Production public artifact configured with public-only site key, canonical links and fail-closed origin handling.');
