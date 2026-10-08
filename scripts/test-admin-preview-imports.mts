import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prefixAdminImports } from '../website/prefix-admin-imports.mts';
import { readBrowserSource } from '../website/browser-source.mts';
const prefix = '/identity/employee-preview';
test('preview rewrites both quote styles and leaves display/API/relative paths intact', () => {
  const source = `const display="import('/admin-portal/display.js')";
  // import('/admin-portal/comment.js')
  fetch('/api/session');import('./relative.js');
  import('/admin-portal/workflow-events.js');import("/admin-portal/workflow-workspace.js");`;
  const result = prefixAdminImports(source, prefix);
  assert.ok(result.includes(`const display="import('/admin-portal/display.js')"`));
  assert.ok(result.includes("// import('/admin-portal/comment.js')"));
  assert.ok(result.includes("fetch('/api/session');import('./relative.js')"));
  for (const module of ['workflow-events', 'workflow-workspace'])
    assert.ok(result.includes(`import("${prefix}/admin-portal/${module}.js")`));
  assert.equal(prefixAdminImports(source, ''), source);
  assert.throws(() => prefixAdminImports(source, '/unreviewed'));
});
test('compiled employee realtime and review handoffs all remain under preview prefix', () => {
  const source = readBrowserSource('admin-portal/live-client.js') + readBrowserSource('portal.js');
  const result = prefixAdminImports(source, prefix);
  for (const module of [
    'workflow-events',
    'workflow-workspace',
    'business-privacy',
    'business-applications',
  ])
    assert.ok(result.includes(`${prefix}/admin-portal/${module}.js`));
  assert.doesNotMatch(result, /import\(["']\/admin-portal\//);
});
