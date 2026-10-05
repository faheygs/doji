import type { Page } from "@playwright/test";
import { test, expect } from '../../coverage-fixture.mts';

// Persisted browser-only drafts are an input boundary, not a production API.
const profileKey = 'doji-business-prototype-profile-v3';
const draftKey = 'doji-business-prototype-setup-draft-v1';
const campaignKey = 'doji-business-prototype-company-campaigns-v3';
const logo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
async function seed(page: Page, entries:Record<string,unknown>) {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries))
      localStorage.setItem(key, JSON.stringify(value));
  }, entries);
  await page.goto('/business-portal/');
  await page.locator('#resumeBusiness').click();
}

for (const [name, draft, step] of [
  ['missing profile and step', {}, 1],
  ['negative step', { profile: {}, step: -4 }, 1],
  ['non-numeric step', { profile: {}, step: 'invalid' }, 1],
  ['interrupted final step', { profile: { logoDataUrl: logo }, step: 99 }, 3],
  ['middle step', { profile: { companyName: 'Draft brand', markets: ['Canada'] }, step: 2 }, 2],
] as const) {
  test(`local onboarding safely resumes ${name}`, async ({ page }) => {
    await seed(page, { [draftKey]: draft });
    await expect(page.locator(`[data-onboarding-step="${step}"]`)).toBeVisible();
    if (step === 3) {
      await expect(page.locator('#profileReview .logoPreview')).toHaveText('');
      await expect(page.locator('#profileReview .logoPreview')).toHaveCSS(
        'background-image',
        /data:image/,
      );
      await page.locator('#onboardingBack').click();
      await page.locator('#onboardingBack').click();
    }
    if (step === 2) await page.locator('#onboardingBack').click();
    await expect(page.locator('#companyName')).toHaveValue(draft.profile?.companyName || '');
    await page.getByRole('button', { name: 'Save and finish later' }).click();
    await expect(page.locator('#portalAuth')).toBeVisible();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey);
    expect(saved.profile.ownerName).toBe('Owner');
    expect(saved.step).toBe(1);
  });
}

for (const profile of [{}, { companyName: 'Logo brand', logoDataUrl: logo }]) {
  test(`minimal saved workspace remains editable ${profile.companyName || 'unnamed'}`, async ({
    page,
  }) => {
    await seed(page, { [profileKey]: profile });
    await expect(page.locator('#portalApp')).toBeVisible();
    await expect(page.locator('[data-owner-name]').first()).toHaveText('Owner');
    await expect(page.locator('#workspaceLogo')).toHaveText(profile.logoDataUrl ? '' : 'C');
    await page.locator('.portalNav [data-view="organization"]').click();
    await page.locator('[data-action="edit-profile"]').click();
    await expect(page.locator('#companyName')).toHaveValue(profile.companyName || '');
    await expect(page.locator('#companyWebsite')).toHaveValue('');
    await expect(page.locator('#companyDescription')).toHaveValue('');
  });
}

for (const [name, record, expected] of [
  [
    'legacy placeholder prompt',
    { format: 'Daily task', formatValue: 'daily_task', prompt: 'Prompt not added yet', status: 'draft' },
    'Not supplied',
  ],
  [
    'unfinished format question',
    { format: 'Format question', formatValue: 'format_question', status: 'draft' },
    'Not supplied — requires completion before review',
  ],
  [
    'exact word answer',
    {
      format: 'Format question',
      formatValue: 'format_question',
      answer_rule: { type: 'exact_word_count', count: 3 },
      status: 'draft',
    },
    'Exactly 3 words',
  ],
  [
    'read-only submitted task',
    { format: 'Daily task', formatValue: 'daily_task', status: 'review' },
    'Not supplied',
  ],
  [
    'revision requested',
    {
      format: 'Poll',
      formatValue: 'poll',
      status: 'review',
      reviewState: 'changes_requested',
      reviewFeedback: '<b>Literal feedback</b>',
      options: ['One', 'Two', 'Other'],
    },
    '<b>Literal feedback</b>',
  ],
] as const) {
  test(`stored ${name} opens a structured record and preserves its review rules`, async ({
    page,
  }) => {
    const doji = { id: 'LOCAL-DOJI', name: 'Synthetic Doji', label: 'Local', ...record };
    await seed(page, {
      [profileKey]: {},
      [campaignKey]: [
        { id: 'LOCAL-CAM', name: 'Synthetic campaign', status: 'draft', dojis: [doji] },
      ],
    });
    await expect(page.locator('#overviewCampaigns')).toContainText('Start pending – End pending');
    await page.locator('#overviewCampaigns [data-campaign-id]').click();
    await expect(page.locator('#campaignDetailBody')).toContainText('Prompt not added yet');
    await expect(page.locator('#campaignDetailBody')).toContainText('Date not requested');
    await page.locator('[data-business-doji="LOCAL-DOJI"]').click();
    await expect(page.locator('#businessDojiDetail')).toBeVisible();
    if (record.reviewFeedback) {
      await expect(page.locator('#businessDojiBody')).toContainText(expected);
      await expect(page.locator('#businessDojiBody b')).toHaveCount(0);
    } else {
      await expect(
        page.locator('#businessDojiBody textarea').filter({ hasText: expected }).first(),
      ).toBeVisible();
    }
    if (record.status === 'review' && !record.reviewState) {
      await expect(page.locator('#editBusinessDoji')).toBeHidden();
      await page.locator('[data-close-business-doji]').first().click();
      await expect(page.locator('[data-business-doji="LOCAL-DOJI"]')).toBeFocused();
    } else {
      await page.locator('#editBusinessDoji').click();
      await expect(page.locator('#campaignPrompt')).toHaveValue('');
      await expect(page.locator('#dojiLiveDate')).toHaveValue('');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      const stored = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!)[0].dojis[0],
        campaignKey,
      );
      expect(stored.id).toBe(doji.id);
      expect(stored.status).toBe('draft');
      if (record.reviewState) {
        expect(stored.previousSubmissions).toHaveLength(1);
        expect(stored.previousSubmissions[0]).toMatchObject({ ...doji, revision: 1 });
        expect(stored.revision).toBe(2);
      }
    }
  });
}

test('legacy campaign without a Doji array accepts its first local draft without a schedule', async ({
  page,
}) => {
  await seed(page, {
    [profileKey]: {},
    [campaignKey]: [{ id: 'LOCAL-CAM', name: 'Empty campaign', status: 'draft' }],
  });
  await page.locator('#overviewCampaigns [data-campaign-id]').click();
  await page.getByRole('button', { name: 'Add first Doji' }).click();
  await page.locator('#dojiName').fill('Unscheduled draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0],
    campaignKey,
  );
  expect(stored.dojis).toHaveLength(1);
  expect(stored.dojis[0]).toMatchObject({
    name: 'Unscheduled draft',
    liveDate: 'Not proposed',
    status: 'draft',
  });
  await page.locator('[data-action="close-campaign-detail"]').first().click();
  await page.locator('.portalNav [data-view="campaigns"]').click();
  await page.locator('[data-campaign-filter="completed"]').click();
  await expect(page.locator('#allCampaigns')).toContainText('No campaigns match this status.');
});

test('a campaign removed in another tab cannot receive a stale Doji edit', async ({ page }) => {
  await seed(page, {
    [profileKey]: {},
    [campaignKey]: [{ id: 'LOCAL-CAM', name: 'Removed campaign', status: 'draft', dojis: [] }],
  });
  await page.locator('#overviewCampaigns [data-campaign-id]').click();
  await page.evaluate((key) => localStorage.setItem(key, '[]'), campaignKey);
  await page.getByRole('button', { name: 'Add first Doji' }).click();
  await expect(page.locator('#toast')).toContainText('Choose a campaign before adding a Doji.');
  await expect(page.locator('#dojiModal')).not.toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), campaignKey)).toEqual(
    [],
  );
});
