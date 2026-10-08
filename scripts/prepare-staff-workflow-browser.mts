// Synthetic, local-only artifact. No credentials, provider calls or deployment.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { instrument, eligible } from './coverage-instrument.mts';
import { inventory } from './check-coverage.mts';
import { adminBundlePath } from './admin-bundle-path.mts';
import {
  browserSourcePath,
  browserAssetPath,
  readBrowserSource,
  compileBrowserSource,
} from '../website/browser-source.mts';

export function prepareStaffWorkflowBrowser(coverage = false, preview = false) {
  const root = path.resolve(import.meta.dirname, '..');
  const outputName = preview ? '.business-admin-qa-20261007' : '.business-admin-qa-20261006';
  const output = path.join(root, 'website', outputName);
  const result = spawnSync(process.execPath, ['website/build-admin.mts'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DOJI_ADMIN_OUTPUT_DIR: outputName,
      DOJI_ADMIN_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      DOJI_ADMIN_SUPABASE_ANON_KEY: 'synthetic-public-key',
      DOJI_ADMIN_API_BASE_URL: 'https://admin.dojipro.com',
      DOJI_ADMIN_ASSET_PREFIX: preview ? '/identity/employee-preview' : '',
      DOJI_ADMIN_EMPLOYEE_ACCOUNTS: 'true',
      DOJI_ADMIN_INDEPENDENT_EMPLOYEE: 'true',
      DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED: 'true',
      DOJI_ADMIN_EDITORIAL_ENABLED: 'true',
      DOJI_ADMIN_STAFF_WORKFLOW_ENABLED: 'true',
      DOJI_ADMIN_CAMPAIGNS_ENABLED: 'false',
      DOJI_ADMIN_SAFETY_REMOVAL_ENABLED: 'false',
      DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED: 'false',
    },
  });
  if (result.status !== 0) throw Error('Synthetic staff workflow build failed');
  if (!coverage) return;
  const bundle = path.join(
    output,
    adminBundlePath(fs.readFileSync(path.join(output, 'index.html'), 'utf8')),
  );
  let content = fs.readFileSync(bundle, 'utf8');
  for (const asset of [
    'admin-portal/auth-journey.js',
    'admin-portal/health-model.js',
    'admin-portal/live-client.js',
    'admin-portal/contextual-help.js',
    'admin-portal/editorial.js',
    'admin-portal/safety-removal.js',
    'portal-select.js',
    'portal.js',
  ]) {
    const file = browserSourcePath(asset);
    const source = readBrowserSource(asset);
    if (!content.includes(source)) throw Error(`Missing bundled source: ${asset}`);
    content = content.replace(source, () =>
      compileBrowserSource(asset, instrument(fs.readFileSync(file, 'utf8'), file).code),
    );
  }
  fs.writeFileSync(bundle, content);
  for (const relative of inventory().filter((file) => file.startsWith('website/'))) {
    // The independent business bundle has its own asset compiler and is not
    // copied into this employee artifact.
    if (relative.startsWith('website/business-portal/identity/')) continue;
    const file = path.join(root, relative);
    if (!eligible(file)) continue;
    const asset = browserAssetPath(relative.slice('website/'.length));
    const target = path.join(output, asset);
    if (!fs.existsSync(target)) continue;
    fs.writeFileSync(
      target,
      compileBrowserSource(asset, instrument(fs.readFileSync(file, 'utf8'), file).code),
    );
  }
}

export default function setup() {
  prepareStaffWorkflowBrowser(process.env.DOJI_BROWSER_COVERAGE === '1');
  prepareStaffWorkflowBrowser(false, true);
}
