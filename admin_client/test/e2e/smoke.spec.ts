import { test, expect } from '@playwright/test';

test.describe('public home', () => {
  test('shows welcome and admin link', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin Login' })).toBeVisible();
  });
});
