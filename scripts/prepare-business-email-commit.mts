// Select only the approved business migration/email work and required new modules.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {posix,resolve} from 'node:path';
import ts from 'typescript';
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
const changed=git('diff','--name-only').split('\n');
const untracked=git('ls-files','--others','--exclude-standard').split('\n');
const all=new Set([...changed,...untracked]);
const selected=new Set([...all].filter(p=>
 /^infra\/business-email\//.test(p)||
 /^infra\/portal-identity\/business-/.test(p)||
 /^supabase\/functions\/business-(portal-v2|application-mail)\//.test(p)||
 /^web\/apps\/business\//.test(p)||
 /^docs\/BUSINESS_/.test(p)||/^docs\/drafts\/business_/.test(p)||
 /^scripts\/(?:.*-)?business[-_]/.test(p)||
 /^scripts\/fixtures\/business/.test(p)||/^scripts\/database\/business-/.test(p)
));
for(const p of ['infra/portal-identity/restricted-sql.mts','supabase/functions/_shared/email-theme.ts','supabase/functions/_shared/doji-email.ts','supabase/functions/_shared/employee-email.ts','supabase/functions/_shared/business-auth.ts','scripts/test-email-theme-shared.mts','docs/releases/EMAIL_BRANDING_2026-10-11.md','web/package-lock.json','web/packages/ui/src/index.ts','web/packages/ui/src/AccountCard.tsx','web/packages/ui/src/theme.tsx','web/packages/ui/src/theme.test.tsx','web/playwright.business.config.ts','web/playwright.access.config.ts','web/playwright.config.ts','web/tests/browser/business-portal-migration.spec.ts','web/tests/browser/business-access-design.spec.ts','web/tests/artifacts.ts'])selected.add(p);
// Local imports can require previously untracked shared contracts. Do not include
// unrelated modified shared implementations merely because they are imported.
const pending=[...selected],seen=new Set<string>();
while(pending.length){
 const path=pending.pop()!;if(seen.has(path)||!/[.](m?ts|tsx|cts)$/.test(path))continue;seen.add(path);
 const body=await readFile(path,'utf8');const source=ts.createSourceFile(path,body,ts.ScriptTarget.Latest,true);
 const specs:string[]=[];
 function visit(n:ts.Node){
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))specs.push(n.moduleSpecifier.text);
  if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))specs.push(n.arguments[0].text);
  ts.forEachChild(n,visit);
 }visit(source);
 for(const spec of specs.filter(s=>s.startsWith('.'))){
  const base=posix.normalize(posix.join(posix.dirname(path),spec));
  for(const candidate of [base,base+'.ts',base+'.tsx',base+'/index.ts']){
   if(candidate.includes('/node_modules/'))break;
   try{await access(candidate);}catch{continue;}
   if(untracked.includes(candidate))selected.add(candidate);
   pending.push(candidate);break;
  }
 }
}
await mkdir('test-results/business-email-commit',{recursive:true});
const files=[...selected].sort();await writeFile('test-results/business-email-commit/files.json',JSON.stringify(files,null,2));
console.log(JSON.stringify({files:files.length,paths:files},null,2));
if(process.argv[2]==='stage'){
 if(git('diff','--cached','--name-only'))throw Error('Index already contains work');
 git('add','--',...files);
 // Stage only the new acceptance/release note, preserving unrelated working-tree documentation.
 for(const path of ['DOJI_CONTEXT.md','docs/REALTIME_ARCHITECTURE.md']){
  const base=git('show',`HEAD:${path}`),working=await readFile(path,'utf8');
  const firstEnd=working.indexOf('\n\n'),oldMarker=path==='DOJI_CONTEXT.md'?'## October 11 business email':'October 11 business email';
  const note=working.slice(firstEnd+2,working.indexOf(oldMarker));
  const baseEnd=base.indexOf('\n\n');const text=base.slice(0,baseEnd+2)+note+base.slice(baseEnd+2)+'\n';
  const blob=execFileSync('git',['hash-object','-w','--stdin'],{input:text,encoding:'utf8'}).trim();
  git('update-index','--cacheinfo',`100644,${blob},${path}`);
 }
 const snapshot=resolve('test-results/business-email-commit/snapshot');await mkdir(snapshot,{recursive:true});
 git('checkout-index','--all',`--prefix=${snapshot.replaceAll('\\','/')}/`);
 console.log('Selected index exported for clean-snapshot validation. No commit or push yet.');
}
