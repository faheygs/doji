import ts from 'typescript';

// Preview modules must never fall back to the independently deployed root UI.
// Change actual import specifiers, not comments, display strings or API paths.
export function prefixAdminImports(source: string, prefix: string): string {
  if (!prefix) return source;
  if (prefix !== '/identity/employee-preview') throw Error('Unsupported employee preview prefix');
  const parsed = ts.createSourceFile(
    'admin-preview.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const edits: { start: number; end: number; text: string }[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = node.arguments[0];
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('/admin-portal/'))
        edits.push({
          start: specifier.getStart(parsed),
          end: specifier.end,
          text: JSON.stringify(prefix + specifier.text),
        });
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
