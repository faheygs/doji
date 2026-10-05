import { test, expect } from '../../coverage-fixture.mts';
import type { Page } from '@playwright/test';
declare global {
  interface Window {
    changes: string[];
    escaped: number;
    DOJI_PORTAL_CONFIG: unknown;
  }
}
async function fixture(page: Page, { accessible = true, label = true, options = true } = {}) {
  await page.route('**/shared-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<link rel="stylesheet" href="/portal.css"><form><fieldset>${label ? '<label for="choice">Choose region</label>' : ''}<p id="hint">Choose an available region.</p><select id="choice" required aria-describedby="hint">${options ? '<option value="a">Alpha</option><option value="b" disabled>Beta</option><option value="c">Charlie</option><option value="d">Delta</option>' : ''}</select></fieldset></form><label id="existing-label" for="other">Other choice</label><select id="other"><option value="x">X-ray</option></select><button id="outside">Outside</button><script src="/portal-select.js"></script>`,
    }),
  );
  await page.goto('/shared-fixture');
  await page.locator('form').evaluate((node) => {
    node.style.minHeight = '350px';
  });
  await page.locator('#outside').evaluate((node: HTMLButtonElement) => {
    node.style.position = 'fixed';
    node.style.right = '10px';
    node.style.top = '10px';
  });
  await page.evaluate((accessible) => {
    const select = document.querySelector<HTMLSelectElement>('#choice');
    const other = document.querySelector<HTMLSelectElement>('#other');
    if (!select || !other) throw Error('Missing fixture selects');
    window.changes = [];
    select.addEventListener('change', () => window.changes.push(select.value));
    window.DojiPortalSelect.enhance(select, accessible);
    window.DojiPortalSelect.enhance(select, accessible);
    window.DojiPortalSelect.enhance(other, true);
  }, accessible);
}
const trigger = (page: Page) => page.locator('#choice + .portalSelectTrigger');

test('dropdown enhancement rejects detached elements and detects a damaged trigger', async ({
  page,
}) => {
  await fixture(page);
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    try {
      window.DojiPortalSelect.enhance(document.createElement('select'));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    const select = document.querySelector<HTMLSelectElement>('#choice');
    if (!select) throw Error('Missing fixture select');
    document.querySelector('#choice + button span')?.remove();
    try {
      window.DojiPortalSelect.refresh(select);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    return errors;
  });
  expect(failures).toEqual([
    'Select must be mounted before enhancement',
    'Missing select trigger text',
  ]);
});
test('dropdown enhancement is idempotent and label, hint and required state remain connected', async ({
  page,
}) => {
  await fixture(page);
  await expect(page.locator('.portalSelect')).toHaveCount(2);
  await expect(trigger(page)).toHaveAccessibleName('Choose region');
  await expect(trigger(page)).toHaveAttribute('aria-describedby', 'hint');
  await expect(trigger(page)).toHaveAttribute('aria-required', 'true');
  await page.locator('label[for=choice]').click();
  await expect(trigger(page)).toBeFocused();
  await expect(page.locator('#choice')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#other + button')).toHaveAttribute(
    'aria-labelledby',
    'existing-label',
  );
});
test('arrow navigation skips disabled options, clamps boundaries and commits only on Enter', async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).focus();
  await trigger(page).press('ArrowDown');
  await trigger(page).press('ArrowDown');
  await expect(page.locator('#choice')).toHaveValue('a');
  await trigger(page).press('Enter');
  await expect(page.locator('#choice')).toHaveValue('c');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await trigger(page).press('ArrowUp');
  await trigger(page).press('Home');
  await trigger(page).press('ArrowUp');
  await trigger(page).press('Enter');
  await expect(page.locator('#choice')).toHaveValue('a');
  expect(await page.evaluate(() => window.changes)).toEqual(['c', 'a']);
});
test('End and Space choose the last enabled option; ignored shortcuts never change it', async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).focus();
  await trigger(page).press(' ');
  await trigger(page).press('End');
  await trigger(page).press('ArrowDown');
  await trigger(page).press(' ');
  await expect(page.locator('#choice')).toHaveValue('d');
  await trigger(page).press('Control+a');
  await trigger(page).press('Meta+a');
  await trigger(page).press('Alt+a');
  await trigger(page).press('Shift');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
});
test('typeahead selects matching enabled options, unmatched input preserves highlight', async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).focus();
  await trigger(page).press('c');
  await trigger(page).press('z');
  await trigger(page).press('Enter');
  await expect(page.locator('#choice')).toHaveValue('c');
  await trigger(page).press('b');
  await trigger(page).press('Enter');
  await expect(page.locator('#choice')).toHaveValue('c');
});
test('Escape closes only the open menu and Tab leaves it without committing', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    window.escaped = 0;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.escaped++;
    });
  });
  await trigger(page).click();
  await trigger(page).press('End');
  await trigger(page).press('Escape');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger(page)).not.toHaveAttribute('aria-activedescendant', /.+/);
  expect(await page.evaluate(() => window.escaped)).toBe(0);
  await trigger(page).press('Escape');
  expect(await page.evaluate(() => window.escaped)).toBe(1);
  await trigger(page).click();
  await trigger(page).press('Tab');
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#choice')).toHaveValue('a');
});
test('switching dropdowns, clicking outside and focus leaving remove the active menu', async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).click();
  await page.locator('#other + button').click();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#other + button')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#outside').click();
  await expect(page.locator('.portalSelect.open')).toHaveCount(0);
  await trigger(page).click();
  await page.locator('#outside').focus();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
});
test('option pointer focus remains inside wrapper until selection and returns to trigger', async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).click();
  const option = page.getByRole('option', { name: 'Charlie' });
  await option.focus();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  await option.click();
  await expect(page.locator('#choice')).toHaveValue('c');
  await expect(trigger(page)).toBeFocused();
});
test('refresh follows dynamic choices and inherited fieldset disabling closes the menu', async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).click();
  await page.evaluate(() => {
    const fieldset = document.querySelector('fieldset');
    const select = document.querySelector<HTMLSelectElement>('#choice');
    if (!fieldset || !select) throw Error('Missing fixture fields');
    fieldset.disabled = true;
    window.DojiPortalSelect.refresh(select);
  });
  await expect(trigger(page)).toBeDisabled();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => {
    const fieldset = document.querySelector('fieldset');
    const select = document.querySelector<HTMLSelectElement>('#choice');
    if (!fieldset || !select) throw Error('Missing fixture fields');
    fieldset.disabled = false;
    select.required = false;
    select.innerHTML = '<option value="new">New region</option>';
    window.DojiPortalSelect.refresh(select);
    window.DojiPortalSelect.refresh(document.createElement('select'));
  });
  await expect(trigger(page)).toBeEnabled();
  await expect(trigger(page)).toHaveText('New region');
  await expect(trigger(page)).toHaveAttribute('aria-required', 'false');
});
test('invalid native selection marks shared control and next change clears feedback', async ({
  page,
}) => {
  await fixture(page);
  await page
    .locator('#choice')
    .evaluate((select) => select.dispatchEvent(new Event('invalid', { cancelable: true })));
  await expect(trigger(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await page.getByRole('option', { name: 'Delta' }).click();
  await expect(trigger(page)).not.toHaveAttribute('aria-invalid', /.+/);
});
test('empty optional-label dropdown has an honest placeholder and no selectable phantom option', async ({
  page,
}) => {
  await fixture(page, { label: false, options: false });
  await expect(trigger(page)).toHaveText('Choose an option');
  await trigger(page).focus();
  await trigger(page).press('End');
  await trigger(page).press('Enter');
  await expect(page.locator('#choice')).toHaveValue('');
  expect(await page.evaluate(() => window.changes)).toEqual([]);
});
test('legacy non-combobox presentation retains native state and click selection', async ({
  page,
}) => {
  await fixture(page, { accessible: false });
  await expect(trigger(page)).not.toHaveAttribute('role', 'combobox');
  await trigger(page).click();
  await page.getByRole('listbox').getByRole('option', { name: 'Charlie' }).click();
  await expect(page.locator('#choice')).toHaveValue('c');
});
for (const stored of [null, 'dark', 'blocked'])
  test(`theme initialization with ${stored} storage never touches authentication`, async ({
    page,
  }) => {
    await page.route('**/theme-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<main>Theme fixture</main><script src="/theme-init.js"></script><script src="/portal-config.js"></script>',
      }),
    );
    await page.addInitScript((stored) => {
      localStorage.setItem('member-session', 'untouched');
      if (stored === 'blocked') {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw Error('Storage unavailable');
          },
        });
      } else if (stored) localStorage.setItem('doji-portal-theme', stored);
    }, stored);
    await page.goto('/theme-fixture');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      stored === 'dark' ? 'dark' : 'light',
    );
    expect(await page.evaluate(() => window.DOJI_PORTAL_CONFIG)).toEqual({
      mode: 'prototype',
      supabaseUrl: '',
      supabaseAnonKey: '',
      apiBaseUrl: '',
    });
    if (stored !== 'blocked')
      expect(await page.evaluate(() => localStorage.getItem('member-session'))).toBe('untouched');
  });
