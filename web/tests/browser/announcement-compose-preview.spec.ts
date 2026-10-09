import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({ timezoneId: 'America/Denver' });

async function date(page: Page, label: string, hour: string) {
  const group = page.getByRole('group', { name: label, exact: true });
  for (const [name, value] of [
    ['Month', '11'],
    ['Day', '03'],
    ['Year', '2030'],
    ['Hours', hour],
    ['Minutes', '30'],
    ['Meridiem', 'AM'],
  ] as const) {
    const section = group.getByRole('spinbutton', { name, exact: true });
    await section.click();
    await section.pressSequentially(value);
  }
}
test('full announcement preview preserves UTC, reward settings and keyboard confirmation without writes', async ({
  page,
}, info) => {
  const unexpected: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4310' || request.method() !== 'GET')
      unexpected.push(request.method() + ' ' + url.pathname);
  });
  await page.goto('http://127.0.0.1:4310/announcements/new');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Share your ideas');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Tell us what you would like to do next.');
  await page.getByRole('radio', { name: 'Schedule', exact: true }).check();
  await date(page, 'Start showing (UTC)', '06');
  await date(page, 'Stop showing (UTC)', '08');
  await page.getByRole('button', { name: 'Button, reward and display settings' }).click();
  await page.getByRole('textbox', { name: 'Button label', exact: true }).fill('Suggest');
  await page.getByRole('combobox', { name: 'Button destination' }).click();
  await page.getByRole('option', { name: 'Suggest a Doji', exact: true }).click();
  await page.getByRole('combobox', { name: 'Completion reward' }).click();
  await page.getByRole('option', { name: 'Sparks for submitting a Doji idea' }).click();
  await page.getByRole('spinbutton', { name: 'Sparks per completion' }).fill('75');
  await page.getByRole('spinbutton', { name: 'Maximum displays per account' }).fill('3');
  await page.screenshot({
    path: info.outputPath('announcement-complete-editor.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Validate preview' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('dialog')).toContainText('2030-11-03T06:30:00.000Z');
  await expect(page.getByRole('dialog')).toContainText('75 Sparks');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Back to editing' })).toBeFocused();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('announcement-schedule-preview.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Sparks per completion' })).toHaveValue('75');
  await page.getByRole('button', { name: 'Preview draft save' }).click();
  await expect(page.getByRole('dialog')).toContainText('does not make it visible to members');
  expect(unexpected).toEqual([]);
});
test('invalid button configuration stays editable and advanced controls fit narrow screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4310/announcements/new');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Message');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Preview content');
  await date(page, 'Stop showing (UTC)', '08');
  await page.getByRole('button', { name: 'Button, reward and display settings' }).click();
  await page
    .getByRole('textbox', { name: 'Button label', exact: true })
    .fill('Missing destination');
  await page.getByRole('button', { name: 'Validate preview' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'both a button label' })).toContainText(
    'both a button label and destination',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Button label', exact: true })).toHaveValue(
    'Missing destination',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Publish now', exact: true })).toBeDisabled();
});
