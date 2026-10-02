// One-shot loopback handoff for the approved read-only Sentry token.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const testMode=process.argv.includes('--self-test');
const port=testMode?4196:4198;
const root=resolve(testMode?'test-results/monitoring-handoff-'+Date.now():'.artifacts/employee-runtime');
const file=resolve(root,'monitoring.json');
mkdirSync(root,{recursive:true});
if(existsSync(file))throw Error('Configuration already exists; do not overwrite.');
if(!testMode)execFileSync('git',['check-ignore',file],{stdio:'pipe'});
const owner=execFileSync('whoami',[],{encoding:'utf8'}).trim();
execFileSync('icacls',[root,'/inheritance:r','/grant:r',`${owner}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{stdio:'pipe'});
const csrf=randomBytes(32).toString('hex'),nonce=randomBytes(18).toString('base64'),origin=`http://127.0.0.1:${port}`;
let saved=false;
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
  if(req.method==='GET'&&req.url==='/'&&!saved){
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><title>Local employee monitoring handoff</title><h1>Protected local monitoring setup</h1><p>This saves only the approved Sentry read-only token on this computer. It is not sent to another website.</p><form method="post" action="/capture"><input type="hidden" name="csrf" value="${csrf}"><label>Sentry read-only token <input type="password" name="token" autocomplete="off" required></label><button>Save locally</button></form><p id="status" role="status"></p><script nonce="${nonce}">document.querySelector('form').addEventListener('submit',async function(event){event.preventDefault();const button=this.querySelector('button');button.disabled=true;document.getElementById('status').textContent='Saving locally…';try{const response=await fetch('/capture',{method:'POST',body:new URLSearchParams(new FormData(this)),cache:'no-store'});if(!response.ok)throw Error();this.reset();this.hidden=true;document.title='Saved securely';document.getElementById('status').textContent='Saved securely. No further action is needed.';}catch{document.getElementById('status').textContent='Not saved. The local receiver could not complete the request.';button.disabled=false;}});</script>`);return;
  }
  if(req.method!=='POST'||req.url!=='/capture'||req.headers.origin!==origin||saved){res.writeHead(403).end();return;}
  try{
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error();}
    const form=new URLSearchParams(body),token=form.get('token');
    if(form.get('csrf')!==csrf||!token||!/^[A-Za-z0-9_-]{32,1024}$/.test(token)||(testMode&&token!=='0'.repeat(64)))throw Error();
    writeFileSync(file,JSON.stringify({token,organization:'doji-i0',projectIds:[],scope:'event:read',integration:'doji-admin-health-read-524d26'}),{flag:'wx'});
    saved=true;res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Saved</title><h1>Saved securely</h1><p>The token was saved without displaying it. This local receiver is now closed.</p>');
    console.log('Read-only monitoring token saved in protected Git-ignored configuration.');server.close();
  }catch{res.writeHead(400).end('Not saved. Check the token and try again.');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local handoff ready at '+origin+(testMode?' (synthetic test only)':'')));
setTimeout(()=>server.close(),600000).unref();
