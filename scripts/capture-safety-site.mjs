// Bounded read-only capture of the deployed static site and its local known routes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';
import {root,hash,save} from './prepare-safety-launch.mjs';
const meta=JSON.parse(await readFile(`${root}/pages-before.json`,'utf8'))['doji-site'];
const origin=meta.canonical_deployment.url;
assert.equal(meta.canonical_deployment.uses_functions,false);
const known=execFileSync('git',['ls-files','website'],{encoding:'utf8'}).trim().split('\n').map(p=>p.slice(8)).filter(p=>/\.(html|css|js|png|xml|txt|svg|ico|webp|woff2)$/.test(p)&&!p.includes('.test.')&&!p.includes('/e2e/')&&!p.includes('validate')&&!p.includes('build-'));
const queue=[...new Set(['index.html','sitemap.xml','robots.txt',...known])],rows=[],seen=new Set();let homeHash;
while(queue.length){
 const path=queue.shift();if(seen.has(path))continue;seen.add(path);
 assert.ok(seen.size<=80,'Bounded static capture');
 assert.match(path,/^[a-zA-Z0-9_./-]+$/);assert.ok(!path.split('/').includes('..'));
 const r=await fetch(`${origin}/${path}`,{signal:AbortSignal.timeout(15000),redirect:'follow'});
 assert.equal(new URL(r.url).origin,origin,'Static capture cannot leave pinned deployment');
 const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length<3e6);
 const sha=hash(bytes);if(path==='index.html')homeHash=sha;
 if(r.status===404||path!=='index.html'&&sha===homeHash){rows.push({path,status:r.status,fallback:true});continue;}
 assert.equal(r.status,200,`Cannot capture ${path}`);
 const local=await readFile(`website/${path}`).catch(()=>null);
 const row={path,status:r.status,sha256:sha,sourceMatches:local?hash(local)===sha:null,headers:Object.fromEntries(['content-security-policy','referrer-policy','permissions-policy','x-frame-options','x-content-type-options','cache-control'].map(k=>[k,r.headers.get(k)]))};
 rows.push(row);await mkdir(dirname(`${root}/public-before/${path}`),{recursive:true});await writeFile(`${root}/public-before/${path}`,bytes,{flag:'wx'});
 if(/\.(html|css|xml)$/.test(path)){
  for(const m of bytes.toString().matchAll(/(?:href|src)=["']([^"']+)["']|url\(["']?([^"')]+)["']?\)|<loc>([^<]+)<\/loc>/g)){
   const raw=m[1]||m[2]||m[3];if(raw.startsWith('#')||raw.startsWith('data:'))continue;
   const url=new URL(raw,`${origin}/${path}`);if(![origin,'https://dojipro.com','https://www.dojipro.com'].includes(url.origin))continue;
   let next=decodeURIComponent(url.pathname).slice(1);if(!next||next.endsWith('/'))next+='index.html';
   if(/\.(html|css|js|png|xml|txt|svg|ico|webp|woff2)$/.test(next)&&!seen.has(next))queue.push(next);
  }
 }
}
await save('public-before-manifest.json',{at:new Date().toISOString(),deployment:meta.canonical_deployment.id,origin,scope:'Pinned static deployment: repository known routes plus linked HTML/CSS/sitemap assets; no functions',rows});
console.log(JSON.stringify(rows.map(({path,fallback,sourceMatches})=>({path,fallback,sourceMatches}))));
