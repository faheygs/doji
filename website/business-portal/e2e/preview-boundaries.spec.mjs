import { test, expect, reloadWithCoverage } from '../../coverage-fixture.mjs';

// Browser-only prototype contracts, not production signup or campaign delivery.
const drafts = 'doji-business-prototype-sample-campaigns-v3';
async function open(page) {
  await page.goto('/business-portal/');
  await page.getByRole('button', { name: 'Open example workspace', exact: true }).click();
}
async function pick(page, id, label) {
  await page.locator(`#${id} + .portalSelectTrigger`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function startCampaign(page) {
  await page.locator('[data-action="new-campaign"]').first().click();
  await page.locator('#campaignName').fill('Synthetic campaign');
  await pick(page, 'campaignGoal', 'Brand awareness');
  await page.locator('#campaignStart').fill('2026-11-01');
  await page.locator('#campaignEnd').fill('2026-11-30');
  await page.locator('#campaignSummary').fill('Only a local regression fixture.');
}
async function startDoji(page) {
  await open(page);
  await startCampaign(page);
  await page
    .locator('#campaignForm')
    .getByRole('button', { name: 'Create campaign', exact: true })
    .click();
  await page.locator('#dojiName').fill('Synthetic prompt');
  await page.locator('#campaignPrompt').fill('Choose a morning ritual.');
  await page.locator('#dojiLiveDate').fill('2026-11-10');
}
async function denyStorage(page, key) {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    window.restoreSyntheticStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Synthetic quota limit', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
}
async function createAccount(page) {
  await page.goto('/business-portal/?view=signup');
  await page.locator('#accountName').fill('Synthetic Owner');
  await page.locator('#signupEmail').fill('owner@example.test');
  await page.getByRole('button', { name: 'Start local setup' }).click();
}
async function basics(page) {
  for (const [id, value] of Object.entries({
    companyName: 'Local Brand',
    companyLegalName: 'Local Brand Ltd',
    companyWebsite: 'https://example.test',
    companyDescription: 'Local fixture, never submitted.',
  })) {
    await page.locator(`#${id}`).fill(value);
  }
}

test('mobile navigation closes on Escape and navigation, and theme persists separately', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await open(page);
  await page.locator('#mobileMenu').click();
  await expect(page.locator('#mobileMenu')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobileMenu')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#mobileMenu').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#portalSidebar')).not.toHaveClass(/open/);
  await page.locator('#mobileMenu').click();
  await page.locator('.portalNav [data-view="campaigns"]').click();
  await expect(page.locator('#portalPageTitle')).toHaveText('Campaigns');
  await expect(page.locator('#mobileMenu')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#portalApp [data-action="toggle-theme"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await reloadWithCoverage(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Open example workspace', exact: true }).click();
  await page.locator('#portalApp [data-action="toggle-theme"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('campaign filters, keyboard rows and view jumps retain the selected navigation state', async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-view-jump="campaigns"]').click();
  for (const [filter, id] of [
    ['draft', 'CAM-NEW'],
    ['review', 'CAM-102'],
    ['approved', 'CAM-099'],
    ['completed', 'CAM-094'],
  ]) {
    await page.locator(`[data-campaign-filter="${filter}"]`).click();
    await expect(page.locator('#allCampaigns [data-campaign-id]')).toHaveCount(1);
    const row = page.locator(`#allCampaigns [data-campaign-id="${id}"]`);
    await row.focus();
    await row.press('ArrowRight');
    await expect(page.locator('#campaignDetailModal')).not.toBeVisible();
    await row.press('Space');
    await expect(page.locator('#campaignDetailModal')).toBeVisible();
    if (filter === 'completed')
      await expect(page.locator('#campaignDetailBody')).toContainText('12,809');
    await page
      .locator('#campaignDetailModal [data-action="close-campaign-detail"]')
      .first()
      .click();
  }
  await page.locator('[data-campaign-filter="all"]').click();
  await expect(page.locator('#allCampaigns [data-campaign-id]')).toHaveCount(4);
  await page.getByRole('button', { name: 'Go to workspace overview' }).click();
  await expect(page.locator('.portalNav [data-view="overview"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('sample analytics select one poll or photo and never present example figures as measured delivery', async ({
  page,
}) => {
  await open(page);
  await page.locator('.portalNav [data-view="analytics"]').click();
  await expect(page.locator('#resultsMetrics .metricCard strong')).toHaveText([
    '18,420',
    '14,218',
    '12,809',
    '90.1%',
  ]);
  await pick(page, 'analyticsDoji', 'Sunday recharge poll');
  await expect(page.locator('#pollResultsPanel')).toBeVisible();
  await expect(page.locator('#pollResultsList > div')).toHaveCount(5);
  await expect(page.locator('#pollResultsList')).toContainText('Other');
  await expect(page.locator('#resultsMetrics .metricCard strong')).toHaveText([
    '9,100',
    '6,906',
    '6,221',
    '90.1%',
  ]);
  await expect(page.locator('#analyticsSampleBanner')).toContainText('Sample figures only');
  await pick(page, 'analyticsDoji', 'Weekend reset ritual');
  await expect(page.locator('#pollResultsPanel')).toBeHidden();
});

for (const [field, value, error] of [
  ['campaignName', '   ', 'Add a campaign name'],
  ['campaignEnd', '2026-10-01', 'on or after'],
  ['campaignSummary', '   ', 'Add a campaign brief'],
  ['campaignStart', '', 'Campaign start'],
])
  test(`campaign validation preserves input and prevents writes: ${field}`, async ({ page }) => {
    await open(page);
    await startCampaign(page);
    await page.locator(`#${field}`).fill(value);
    await page
      .locator('#campaignForm')
      .getByRole('button', { name: 'Create campaign', exact: true })
      .click();
    await expect(page.locator('#campaignForm .businessFormError')).toContainText(error);
    await expect(page.locator('#campaignModal')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), drafts)).toBeNull();
  });

test('campaign storage failure preserves the complete form and permits an explicit retry', async ({
  page,
}) => {
  await open(page);
  await startCampaign(page);
  await denyStorage(page, drafts);
  await page
    .locator('#campaignForm')
    .getByRole('button', { name: 'Create campaign', exact: true })
    .click();
  await expect(page.locator('#campaignForm .businessFormError')).toContainText(
    'could not save the campaign',
  );
  await expect(page.locator('#campaignName')).toHaveValue('Synthetic campaign');
  await expect(page.locator('#campaignSummary')).toHaveValue('Only a local regression fixture.');
  await page.evaluate(() => window.restoreSyntheticStorage());
  await page
    .locator('#campaignForm')
    .getByRole('button', { name: 'Create campaign', exact: true })
    .click();
  await expect(page.locator('#dojiModal')).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, drafts)).toBe(
    1,
  );
  await page.locator('#dojiModal [data-action="close-doji"]').first().click();
  await page.locator('#campaignDetailModal [data-action="close-campaign-detail"]').first().click();
  await page.locator('[data-action="new-campaign"]').first().click();
  await page.locator('#campaignModal [data-action="close-campaign"]').first().click();
  await expect(page.locator('#campaignModal')).not.toBeVisible();
});

test('poll option limits, removal and Would You Rather conversion preserve two distinct choices', async ({
  page,
}) => {
  await startDoji(page);
  await page.locator('#addPollOption').click();
  await page.locator('#addPollOption').click();
  await expect(page.locator('#addPollOption')).toBeHidden();
  await expect(page.locator('#campaignOptionsList .pollOptionInput')).toHaveCount(4);
  await page.locator('.removePollOption').last().click();
  await expect(page.locator('#campaignOptionsList .pollOptionInput')).toHaveCount(3);
  await pick(page, 'campaignFormat', 'Would you rather');
  await expect(page.locator('#campaignOptionsList .pollOptionInput')).toHaveCount(2);
  await expect(page.locator('#automaticOtherOption')).toBeHidden();
  await page.getByLabel('Choice 1', { exact: true }).fill('Coffee');
  await page.getByLabel('Choice 2', { exact: true }).fill('Tea');
  await page.getByRole('button', { name: 'Submit Doji for review', exact: true }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0], drafts);
  expect(saved.dojis[0]).toMatchObject({
    formatValue: 'wyr',
    options: ['Coffee', 'Tea'],
    status: 'review',
    answer_rule: null,
  });
});

test('starts-with-letter format round-trips the rule and a valid HTTPS destination', async ({
  page,
}) => {
  await startDoji(page);
  await pick(page, 'campaignFormat', 'Format question');
  await pick(page, 'businessAnswerType', 'Starts with a letter');
  await page.locator('#businessStartingLetter').fill('z');
  await page.locator('#campaignDestination').fill('https://example.test/info');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.locator('[data-business-doji]').click();
  await expect(page.locator('#businessDojiBody')).toContainText('Answer format');
  await expect(page.locator('#businessDojiBody textarea').nth(3)).toHaveValue('Starts with Z');
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await expect(page.locator('#businessStartingLetter')).toHaveValue('Z');
  await expect(page.locator('#campaignDestination')).toHaveValue('https://example.test/info');
});

for (const date of ['2026-10-31', '2026-12-01'])
  test(`draft rejects a date outside its campaign: ${date}`, async ({ page }) => {
    await startDoji(page);
    await page.locator('#dojiLiveDate').fill(date);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('inside the campaign');
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0].dojis, drafts),
    ).toEqual([]);
  });

test('Doji save failure retains edits without adding an unpersisted record', async ({ page }) => {
  await startDoji(page);
  await denyStorage(page, drafts);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#dojiForm .businessFormError')).toContainText(
    'could not save the Doji',
  );
  await expect(page.locator('#dojiName')).toHaveValue('Synthetic prompt');
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0].dojis, drafts),
  ).toEqual([]);
});

test('a draft made read-only while editing rejects the stale save', async ({ page }) => {
  await startDoji(page);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.locator('[data-business-doji]').click();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.evaluate((key) => {
    const records = JSON.parse(localStorage.getItem(key));
    records[0].dojis[0].status = 'approved';
    localStorage.setItem(key, JSON.stringify(records));
  }, drafts);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#dojiForm .businessFormError')).toContainText('no longer editable');
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0].dojis[0].status, drafts),
  ).toBe('approved');
});

test('onboarding rejects missing fields, missing market and unchecked consent; Back preserves values', async ({
  page,
}) => {
  await createAccount(page);
  await page.locator('#onboardingNext').click();
  await expect(page.locator('[data-onboarding-step="1"]')).toBeVisible();
  await basics(page);
  await page.locator('#onboardingNext').click();
  for (const [id, label] of [
    ['companyIndustry', 'Technology'],
    ['companySize', '1–10 employees'],
    ['companyCountry', 'Canada'],
    ['companyGoal', 'Brand awareness'],
  ])
    await pick(page, id, label);
  await page
    .locator('.choiceGrid label')
    .filter({ has: page.locator('input[value="United States"]') })
    .click();
  await expect(page.locator('[name="companyMarkets"][value="United States"]')).not.toBeChecked();
  await page.locator('#onboardingNext').click();
  await expect(page.locator('#toast')).toContainText('Choose at least one market');
  await page
    .locator('.choiceGrid label')
    .filter({ has: page.locator('input[value="Canada"]') })
    .click();
  await expect(page.locator('[name="companyMarkets"][value="Canada"]')).toBeChecked();
  await page.locator('#onboardingNext').click();
  await page.locator('#onboardingNext').click();
  await expect(page.locator('[data-onboarding-step="3"]')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('doji-business-prototype-profile-v3')),
  ).toBeNull();
  await page.locator('#onboardingBack').click();
  await expect(page.locator('#companyCountry')).toHaveValue('Canada');
  await page.locator('#onboardingBack').click();
  await expect(page.locator('#companyName')).toHaveValue('Local Brand');
});

test('logo selection is local, oversized files are rejected and draft quota errors keep the form open', async ({
  page,
}) => {
  await createAccount(page);
  await basics(page);
  await page
    .locator('#companyLogo')
    .setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(1500001) });
  await expect(page.locator('#toast')).toContainText('smaller than 1.5 MB');
  await expect(page.locator('#companyLogo')).toHaveValue('');
  await page.locator('#companyLogo').setInputFiles([]);
  await page.locator('#companyLogo').setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.locator('#logoPreview')).toHaveCSS(
    'background-image',
    /data:image\/png;base64/,
  );
  await denyStorage(page, 'doji-business-prototype-setup-draft-v1');
  await page.getByRole('button', { name: 'Save and finish later' }).click();
  await expect(page.locator('#onboardingForm .businessFormError')).toContainText(
    'could not save your progress',
  );
  await expect(page.locator('#portalOnboarding')).toBeVisible();
  await expect(page.locator('#companyName')).toHaveValue('Local Brand');
});

test('prototype reset requires confirmation and never clears unrelated member or employee storage', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    localStorage.setItem('member-session', 'synthetic');
    sessionStorage.setItem('employee-session', 'synthetic');
    localStorage.setItem('doji-business-prototype-profile-v3', '{}');
  });
  await page.locator('.portalNav [data-view="organization"]').click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('[data-action="reset-business-demo"]').click();
  await expect(page.locator('#portalApp')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-action="reset-business-demo"]').click();
  await expect(page.locator('#signupForm')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      member: localStorage.getItem('member-session'),
      employee: sessionStorage.getItem('employee-session'),
      profile: localStorage.getItem('doji-business-prototype-profile-v3'),
    })),
  ).toEqual({ member: 'synthetic', employee: 'synthetic', profile: null });
});
