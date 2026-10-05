// Static call-site inventory, including dynamic targets that need manual review.
// This is NOT a claim that every endpoint or every parameter variant was tested.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
const rows:{file:string;line:number;kind:string;callee:string;target:string}[] = [];
function scan(directory:string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.tsx?$/.test(file)) continue;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node:ts.Node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(source);
        const member = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : null;
        let kind;
        if (callee === 'executeCommand') kind = 'command';
        else if (callee.startsWith('supabase') && member && ['rpc', 'from', 'invoke'].includes(member)) kind = member;
        else if (/^supabase\.auth\./.test(callee)) kind = 'auth';
        else if (['fetch', 'observedMemberFetch', 'readThroughScaleGateway'].includes(callee)) kind = 'transport';
        if (kind) {
          const arg = node.arguments[0];
          const literal = arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg));
          rows.push({ file: file.replaceAll('\\', '/'), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind, callee, target: literal ? arg.text : '[dynamic or absent; review source]' });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
for (const root of ['app', 'hooks', 'lib', 'stores', 'utils']) scan(root);
const output = 'test-results/member-api-audit/call-sites.json';
mkdirSync('test-results/member-api-audit', { recursive: true });
writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), limitation: 'Static inventory, not test coverage', rows }, null, 2));
console.log(JSON.stringify({ output, callSites: rows.length,
  uniqueLiteralCommands: new Set(rows.filter(r => r.kind === 'command' && !r.target.startsWith('[')).map(r => r.target)).size,
  uniqueLiteralRPCs: new Set(rows.filter(r => r.kind === 'rpc' && !r.target.startsWith('[')).map(r => r.target)).size }));
