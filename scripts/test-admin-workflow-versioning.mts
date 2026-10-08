import test from 'node:test';
import assert from 'node:assert/strict';
import { versionWorkflowImports, versionAdminWorkflowHtml } from '../website/version-admin-workflow.mts';
const revision = '1234567890abcdef';
test('versions script and stylesheet even when an older fixed query version exists', () => {
  const html = '<link href="/admin-portal/admin.css?v=old"><script src="/admin-portal/admin-app-20261002d.js"></script><link href="/portal.css?v=old">';
  const actual = versionAdminWorkflowHtml(html, revision);
  assert.equal(actual.split(`?v=${revision}`).length, 3);
  assert.ok(actual.includes('/portal.css?v=old'));
  assert.equal(versionAdminWorkflowHtml(actual, revision), actual);
});
test('versions static, dynamic and re-export workflow dependencies consistently', () => {
  const source = `import {x} from './workflow-contracts.js';
export {y} from './workflow-review.js';
const lazy = import('/admin-portal/workflow-workspace.js');
const preview = import('/identity/employee-preview/admin-portal/workflow-workspace.js');`;
  const actual = versionWorkflowImports(source, revision);
  assert.equal(actual.split(`?v=${revision}`).length, 5);
});
test('does not change other imports, API strings, comments or already versioned imports', () => {
  const source = `import {x} from './other.js';
const path = '/admin-portal/workflow-workspace.js';
// import('/admin-portal/workflow-workspace.js')
import './workflow-view.js?v=old';`;
  assert.equal(versionWorkflowImports(source, revision), source);
  assert.throws(() => versionWorkflowImports(source, 'untrusted'));
});

test('versions business review modules without changing business application renderer imports', () => {
  const source = `const review = import('/admin-portal/business-applications.js');
const privacy = import('/admin-portal/business-privacy.js');
import {applicationForm} from '../business-portal/application-form.js';`;
  const actual = versionWorkflowImports(source, revision);
  assert.equal(actual.split(`?v=${revision}`).length, 3);
  assert.ok(actual.includes("'../business-portal/application-form.js'"));
});
