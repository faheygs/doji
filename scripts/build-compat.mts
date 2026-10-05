// query-string/Metro require a CommonJS dependency entry. TypeScript is the only
// maintained source; the exact emitted adapter is checked before packaging.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
export const compatSource='vendor/decode-uri-component-compat/index.cts';
export const compatArtifact='vendor/decode-uri-component-compat/index.cjs';
const root=resolve(import.meta.dirname,'..');
export function compileCompat(source:string):string {
  const result=ts.transpileModule(source,{fileName:compatSource,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,newLine:ts.NewLineKind.LineFeed}});
  if(result.diagnostics?.some(item=>item.category===ts.DiagnosticCategory.Error))throw Error('Compatibility adapter emission failed');
  return '// Generated from vendor/decode-uri-component-compat/index.cts by scripts/build-compat.mts. Do not edit.\n'+result.outputText;
}
export function assertCompatCurrent(source:string,artifact:string):void {
  if(compileCompat(source)!==artifact)throw Error('Compatibility artifact drift: run node scripts/build-compat.mts --write');
}
export function verifyCompat(projectRoot=root):string {
  assertCompatCurrent(readFileSync(resolve(projectRoot,compatSource),'utf8'),readFileSync(resolve(projectRoot,compatArtifact),'utf8'));
  return compatArtifact;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length>3 || (process.argv[2] && process.argv[2]!=='--write'))throw Error('Use no arguments to verify or --write to regenerate');
  if(process.argv[2]==='--write')writeFileSync(resolve(root,compatArtifact),compileCompat(readFileSync(resolve(root,compatSource),'utf8')));
  verifyCompat();console.log('CommonJS decoder entry matches checked TypeScript source.');
}
