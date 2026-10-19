import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/desktop';
import italian from '../../../src/i18n/lang/it';

const { Given, When, Then } = createBdd(test);

Given('NAS Finder is open with a NAS awaiting setup', async ({ page }) => {
  await page.goto('/');
  await page.locator('#language').selectOption('en');
  await expect(page.getByText('NAS devices found 1')).toBeVisible();
});

When('I open the NAS search', async ({ page }) => {
  await page.getByRole('button', { name: 'Find NAS', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

Then('the discovered NAS needs configuration', async ({ page }) => {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('cell', { name: 'nas-studio' })).toBeVisible();
  await expect(dialog.getByText('Setup required', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Set up NAS' })).toHaveAttribute(
    'href',
    'http://192.168.1.15:80/',
  );
});

When('I save the discovered NAS', async ({ page }) => {
  await page.getByRole('dialog').getByRole('button', { name: 'Save NAS', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Saved', { exact: true })).toBeVisible();
});

When('I close the search', async ({ page }) => {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

When('I open the NAS page', async ({ page }) => {
  await page.getByRole('link', { name: 'Set up NAS' }).click();
});

Then('the native browser opener receives the NAS identity', async ({ page }) => {
  expect(await page.evaluate(() => window.__finderFixture.opened)).toEqual(['a'.repeat(64)]);
});

When('the NAS completes setup and changes its address', async ({ page }) => {
  await page.evaluate(() => {
    const device = window.__finderFixture.found[0];
    if (device) {
      device.configured = true;
      device.secure = true;
      device.port = 443;
      device.address = '192.168.1.20';
    }
  });
});

When('I refresh the NAS list', async ({ page }) => {
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
});

Then('the saved NAS is configured at its new address', async ({ page }) => {
  await expect(page.getByText('Configured', { exact: true })).toBeVisible();
  await expect(page.getByText('192.168.1.20', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open page' })).toHaveAttribute(
    'href',
    'https://192.168.1.20:443/',
  );
  await page.screenshot({ path: '/tmp/nas-finder-ui.png' });
});

Then('the changed NAS connection requires confirmation', async ({ page }) => {
  const dialog = page.getByRole('dialog');
  const scope = (await dialog.count()) ? dialog : page.getByTestId('main_view');
  await expect(scope.getByText('Connection changed', { exact: true })).toBeVisible();
  await expect(scope.getByRole('link', { name: 'Open page' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(await page.evaluate(() => window.__finderFixture.saved[0]?.address)).toBe('192.168.1.15');
});

When('I confirm the new NAS connection', async ({ page }) => {
  const searchDialog = page.getByRole('dialog', { name: 'Network discovery', exact: true });
  const scope = (await searchDialog.count()) ? searchDialog : page.getByTestId('main_view');
  await scope.getByRole('button', { name: 'Confirm connection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm NAS connection' });
  await expect(dialog).toContainText('http://192.168.1.15:80/');
  await expect(dialog).toContainText('https://192.168.1.20:443/');
  await page.screenshot({ path: '/tmp/nas-finder-confirm-connection.png' });
  await dialog.getByRole('button', { name: 'Confirm connection', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

When('the NAS becomes unavailable', async ({ page }) => {
  await page.evaluate(() => {
    window.__finderFixture.found = [];
  });
});

Then('the saved NAS is unavailable and its link is disabled', async ({ page }) => {
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: 'Set up NAS' });
  await expect(link).toHaveAttribute('aria-disabled', 'true');
  await expect(link).not.toHaveAttribute('href');
});

When('I search for an invalid manual address', async ({ page }) => {
  await page.getByLabel('IPv4 address Optional').fill('not-an-ip');
  await page.getByRole('dialog').getByRole('button', { name: 'Find NAS', exact: true }).click();
});

Then('the search reports an invalid IPv4 address', async ({ page }) => {
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('private or local IPv4');
});

When('I retry with the NAS address', async ({ page }) => {
  await page.getByLabel('IPv4 address Optional').fill('192.168.1.15');
  await page.getByRole('dialog').getByRole('button', { name: 'Find NAS', exact: true }).click();
});

When('I change theme and language in the page header', async ({ page }) => {
  const header = page.getByTestId('page_header');
  await header.getByLabel('Theme', { exact: true }).selectOption('light');
  const language = header.locator('#language');
  await language.selectOption('it');
  await expect(language).toHaveAttribute('aria-label', italian.language);
  await language.selectOption('en');
});

Then('the page uses a light theme and English without opening a dialog', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { name: /^Saved devices/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

Then('the search dialog is centered and contained in the window', async ({ page }) => {
  for (const viewport of [
    { width: 1100, height: 700 },
    { width: 640, height: 480 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();

    if (bounds) {
      expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThan(2);
      expect(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2)).toBeLessThan(2);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
  }
});
