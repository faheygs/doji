import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { adminBundlePath } from '../scripts/admin-bundle-path.mts';
import { browserSourcePath, isTypedBrowserAsset } from './browser-source.mts';

const root = resolve(import.meta.dirname);
const generatedBuildAssets = new Set([
  `/${adminBundlePath(await readFile(join(root, 'admin-portal/index.html'), 'utf8'))}`,
]);
const pages = [
  'index.html',
  'privacy/index.html',
  'terms/index.html',
  'community-guidelines/index.html',
  'child-safety/index.html',
  'support/index.html',
  'delete-account/index.html',
  'delete-data/index.html',
  'business/index.html',
  'business-portal/index.html',
  'admin-portal/index.html',
];

let failures = 0;
function fail(message: string) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

for (const page of pages) {
  const fullPath = join(root, page);
  const html = await readFile(fullPath, 'utf8');
  if (!html.includes('<title>')) fail(`${page} is missing a title`);
  if (!html.includes('name="description"')) fail(`${page} is missing a description`);
  if (!html.includes('href="/styles.css"')) fail(`${page} is missing shared styles`);
  const isPrivatePortal = page.endsWith('-portal/index.html');
  if (
    !isPrivatePortal &&
    (!html.includes('/privacy/') || !html.includes('/terms/') || !html.includes('/support/'))
  ) {
    fail(`${page} is missing required legal/support navigation`);
  }
  if (isPrivatePortal && !html.includes('name="robots" content="noindex,nofollow"')) {
    fail(`${page} must be noindex,nofollow`);
  }
  if (
    isPrivatePortal &&
    page !== 'admin-portal/index.html' &&
    !html.toLowerCase().includes('prototype')
  ) {
    fail(`${page} must visibly identify the non-production prototype`);
  }
  if (html.includes('faheygs@gmail.com')) fail(`${page} exposes a personal support address`);

  for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const target = match[1]?.split(/[?#]/)[0];
    if (!target) {
      fail(`${page}: malformed local asset reference`);
      continue;
    }
    if (target === '/' || target.startsWith('/#') || target.startsWith('/mailto:')) continue;
    if (generatedBuildAssets.has(target)) continue;
    const candidate = target.endsWith('/')
      ? join(root, target.slice(1), 'index.html')
      : target.endsWith('.js') && isTypedBrowserAsset(target.slice(1))
        ? browserSourcePath(target.slice(1))
        : join(root, target.slice(1));
    try {
      await access(candidate);
    } catch {
      fail(`${page} references missing local asset/page ${target}`);
    }
  }
}

const icon = await stat(join(root, 'assets/doji-icon.png'));
if (icon.size < 1000) fail('Doji icon asset is unexpectedly small');

const portalScript = await readFile(browserSourcePath('portal.js'), 'utf8');
if (!portalScript.includes('data.portal') && !portalScript.includes('dataset.portal')) {
  fail('portal.js is missing its portal-type boundary');
}

const businessPortal = await readFile(join(root, 'business-portal/index.html'), 'utf8');
for (const requiredId of [
  'signupForm',
  'portalOnboarding',
  'companyLogo',
  'workspaceLogo',
  'firstRunPanel',
  'campaignModal',
  'dojiModal',
  'campaignDetailModal',
  'campaignOptionsList',
  'addPollOption',
  'analyticsCampaign',
  'analyticsDoji',
]) {
  if (!businessPortal.includes(`id="${requiredId}"`))
    fail(`business portal is missing ${requiredId}`);
}
if (!businessPortal.includes('Participation by region'))
  fail('business portal is missing regional reporting');
for (const format of ['Poll', 'Would you rather', 'Question', 'Format question', 'Photo idea']) {
  if (!businessPortal.includes(`>${format}</option>`))
    fail(`business portal is missing the ${format} format`);
}
if (businessPortal.includes('Video challenge'))
  fail('business portal must not offer unsupported video challenges');
if (!portalScript.includes("workspaceMode === 'new'"))
  fail('business portal is missing first-time workspace isolation');
if (!portalScript.includes('renderOnboardingStep'))
  fail('business portal is missing guided onboarding behavior');
if (!portalScript.includes('enhancePortalSelect'))
  fail('business portal is missing the shared select component');
if (!portalScript.includes('addPollOption'))
  fail('business portal is missing repeatable poll options');
if (!businessPortal.includes('id="automaticOtherOption"'))
  fail('business portal is missing the automatic Other poll choice');
if (!portalScript.includes('currentRows.length >= 4'))
  fail('business portal must cap standard polls at four custom choices');
if (businessPortal.includes('2–8 options'))
  fail('business portal still advertises the obsolete eight-choice poll limit');
if (!businessPortal.includes('Optional Learn more link'))
  fail('business portal is missing the approved Learn more destination label');
if (!businessPortal.includes('Create campaign'))
  fail('business portal is missing the campaign-first creation flow');
if (!portalScript.includes('openDojiModal'))
  fail('business portal is missing campaign-scoped Doji creation');
if (!portalScript.includes("localStorage.getItem(themeKey) || 'light'"))
  fail('business portal must default to light mode');
if (!businessPortal.includes('data-action="toggle-theme"'))
  fail('business portal is missing its theme toggle');

const adminPortal = await readFile(join(root, 'admin-portal/index.html'), 'utf8');
const adminCss = await readFile(join(root, 'admin-portal/admin.css'), 'utf8');
for (const requiredId of [
  'globalQueueSearch',
  'inboxTypeFilter',
  'businessAdminGrid',
  'announcementList',
  'auditList',
  'caseDrawer',
  'decisionReason',
  'decisionReasonField',
  'moderationActionStatus',
  'globalSearchModal',
  'adminSigninStatus',
  'adminAuthHint',
  'overviewPlatformPulse',
  'adminMfaSetup',
  'adminMfaChallengeForm',
  'adminTotpEnrollment',
  'adminTotpQr',
  'adminTotpSecret',
  'adminTotpVerifyForm',
  'portalSidebarBackdrop',
  'sidebarClose',
  'legalUrgentAlert',
  'moderationPriority',
  'moderationAccountOutcome',
  'moderationRestrictionDays',
  'claimReportButton',
  'moderationConfirmModal',
  'moderationConfirmForm',
  'moderationHighCount',
  'moderationUnassignedCount',
  'portalDataBanner',
  'operatorAccessNav',
  'operatorList',
  'operatorRoleForm',
  'operatorUsername',
  'operatorRoleSelect',
  'operatorRoleAction',
  'operatorRoleReason',
  'operatorRoleStatus',
]) {
  if (!adminPortal.includes(`id="${requiredId}"`)) fail(`admin portal is missing ${requiredId}`);
}
for (const view of [
  'overview',
  'inbox',
  'moderation',
  'safety',
  'campaigns',
  'businesses',
  'suggestions',
  'announcements',
  'operations',
  'audit',
  'access',
]) {
  if (!adminPortal.includes(`data-portal-view="${view}"`))
    fail(`admin portal is missing its ${view} view`);
}
if (!adminPortal.includes('Restricted queue'))
  fail('admin portal must distinguish restricted legal and safety work');
if (!portalScript.includes('doji-admin-prototype-state-v1'))
  fail('admin portal is missing browser-local workflow state');
if (!portalScript.includes('writeBusinessDecision'))
  fail('admin portal is missing business-review prototype synchronization');
if (!portalScript.includes('recordDecision'))
  fail('admin portal is missing auditable prototype decisions');
if (!adminPortal.includes('data-action="toggle-theme"'))
  fail('admin portal is missing its theme toggle');
// Require exactly one validated local atomic entry, not a historical release filename.
adminBundlePath(adminPortal);
if (!adminPortal.includes('/theme-init.js'))
  fail('admin portal is missing its CSP-safe theme initializer');
if (adminPortal.includes('<script>'))
  fail('admin portal must not use inline scripts under its strict CSP');
if (!portalScript.includes("adminConfig.mode === 'live'"))
  fail('admin portal is missing its explicit live-mode boundary');
if (!portalScript.includes('Announcement writes remain disabled during the read-only rollout.'))
  fail('admin portal must visibly bound production mutations');
if (adminPortal.includes('Text message'))
  fail('admin portal must offer QR-code authenticator setup only');
if (!portalScript.includes('Creating your secure authenticator QR code'))
  fail('admin portal is missing guided authenticator enrollment');
if (
  !adminCss.includes(
    'html[data-theme] .adminPortalPage .portalShell { grid-template-columns: minmax(0,1fr); }',
  )
)
  fail('admin portal must collapse its shell to one column below the tablet breakpoint');
if (!adminCss.includes('height: 100dvh'))
  fail('admin portal mobile navigation must fill the viewport');
if (!portalScript.includes('setSidebarOpen(false)'))
  fail('portal navigation is missing a shared close path');
if (!portalScript.includes("sidebarBackdrop?.setAttribute('aria-hidden', String(!open))"))
  fail('portal navigation is missing synchronized backdrop accessibility state');
if (!portalScript.includes('setLegalUrgentAlert(restrictedSafetyCount)'))
  fail('admin portal legal alert must follow the authoritative restricted-safety count');
if (!portalScript.includes('runLiveTriage'))
  fail('admin portal is missing its live Trust & Safety triage flow');
if (!portalScript.includes('executeLiveDecision'))
  fail('admin portal is missing its live Trust & Safety decision flow');

const adminLiveClient = await readFile(join(root, 'admin-portal/live-client.mts'), 'utf8');
if (adminLiveClient.includes('localStorage'))
  fail('live admin tokens must not use persistent localStorage');
for (const requiredContract of [
  '/portal/admin/session',
  '/portal/admin/command-center',
  ".aal === 'aal2'",
  'enrollTotp',
  'verifyTotpEnrollment',
  "'/factors'",
]) {
  if (!adminLiveClient.includes(requiredContract))
    fail(`live admin client is missing ${requiredContract}`);
}
for (const moderationContract of [
  '/portal/admin/report-case',
  '/portal/admin/report-triage',
  '/portal/admin/report-review-state',
  '/portal/admin/report-decision',
  'signEvidence',
]) {
  if (!adminLiveClient.includes(moderationContract))
    fail(`live admin client is missing moderation contract ${moderationContract}`);
}
for (const operationsContract of [
  '/portal/admin/audit-export',
  '/portal/admin/operators',
  '/portal/admin/operator-role',
  'sessionPolicy',
  'noteActivity',
]) {
  if (!adminLiveClient.includes(operationsContract))
    fail(`live admin client is missing operational contract ${operationsContract}`);
}
if (!portalScript.includes('groupedAuditRows'))
  fail('admin portal is missing meaningful audit access grouping');
if (!portalScript.includes('renderDataHealthBanner'))
  fail('admin portal is missing visible stale-data handling');
if (!portalScript.includes('renderOperators'))
  fail('admin portal is missing its super-admin operator access view');
for (const realtimeContract of [
  'moderation:global',
  'doji:global',
  '/portal/admin/realtime-token',
  'startRealtime',
]) {
  if (!adminLiveClient.includes(realtimeContract))
    fail(`live admin client is missing realtime contract ${realtimeContract}`);
}
const websiteHeaders = await readFile(join(root, '_headers'), 'utf8');
if (
  !websiteHeaders.includes('https://cdn.ably.com') ||
  !websiteHeaders.includes('wss://*.ably.io')
) {
  fail('website CSP is missing the existing Ably browser transport');
}
const adminBuild = await readFile(join(root, 'build-admin.mts'), 'utf8');
for (const deploymentBoundary of ["mode: 'live'", "'.admin-dist'", "'robots.txt'"]) {
  if (!adminBuild.includes(deploymentBoundary))
    fail(`admin deployment build is missing ${deploymentBoundary}`);
}

if (failures > 0) process.exit(1);
console.log(`Validated ${pages.length} pages and their local links.`);
