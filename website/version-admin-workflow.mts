import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import ts from 'typescript';

// Version the entire lazy workflow graph together. A normal reload must not mix
// a new controller with a browser-cached prior workspace or its dependencies.
export function versionWorkflowImports(source: string, revision: string): string {
  if (!/^[a-f0-9]{16}$/.test(revision)) throw Error('Invalid workflow revision');
  const parsed = ts.createSourceFile('asset.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits: { start: number; end: number; text: string }[] = [];
  function visit(node: ts.Node) {
    const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? node.arguments[0] : undefined;
    if (specifier && ts.isStringLiteral(specifier) && /(?:^\.\/|\/admin-portal\/)(?:workflow-[a-z-]+|business-applications|business-privacy)\.js$/.test(specifier.text))
      edits.push({ start: specifier.getStart(parsed), end: specifier.end,
        text: JSON.stringify(`${specifier.text}?v=${revision}`) });
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

export function versionAdminWorkflowHtml(html: string, revision: string): string {
  if (!/^[a-f0-9]{16}$/.test(revision)) throw Error('Invalid workflow revision');
  return html.replace(
    /((?:src|href)="[^"?]*\/admin-portal\/(?:admin-app-20261002d\.js|admin\.css))(?:\?[^"#]*)?"/g,
    `$1?v=${revision}"`,
  );
}

export async function versionAdminWorkflow(root: string) {
  const modules = ['contracts', 'case', 'workspace', 'view', 'review', 'events']
    .map(name => `admin-portal/workflow-${name}.js`);
  for (const name of ['business-applications', 'business-privacy']) {
    const path = `admin-portal/${name}.js`;
    try { await access(`${root}/${path}`); modules.push(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const paths = [...modules, 'portal.js', 'admin-portal/admin-app-20261002d.js', 'admin-portal/admin.css'];
  const sources = await Promise.all(paths.map(path => readFile(`${root}/${path}`, 'utf8')));
  const revision = createHash('sha256').update(JSON.stringify(sources)).digest('hex').slice(0, 16);
  for (let i = 0; i < paths.length; i++) {
    const source = sources[i]; if (source === undefined) throw Error('Missing workflow asset');
    await writeFile(`${root}/${paths[i]}`, versionWorkflowImports(source, revision));
  }
  for (const path of ['index.html', 'admin-portal/index.html']) {
    const html = await readFile(`${root}/${path}`, 'utf8');
    await writeFile(`${root}/${path}`, versionAdminWorkflowHtml(html, revision));
  }
  return revision;
}
