// Deployment bundles erase TypeScript-only imports. Verify every runtime source,
// without falsely requiring files reachable only through type declarations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import ts from 'typescript';
export async function runtimeSourceClosure(root: string, entry: string) {
  const pending = [entry],
    required = new Set<string>();
  while (pending.length) {
    const path = pending.pop();
    assert.ok(path);
    if (required.has(path)) continue;
    assert.ok(!path.startsWith('../') && !posix.isAbsolute(path));
    required.add(path);
    const source = ts.createSourceFile(
      path,
      await readFile(`${root}/${path}`, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      const specifier = node.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) continue;
        const bindings = clause?.namedBindings;
        if (
          !clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((e) => e.isTypeOnly)
        )
          continue;
      } else if (node.isTypeOnly) continue;
      pending.push(posix.normalize(posix.join(posix.dirname(path), specifier.text)));
    }
  }
  return required;
}
