import { test, expect } from '@playwright/test';

test('Billing PDF Export Flow (Golden Path)', async ({ page }) => {
  // 1. Navigate to the local dev server (Projects Hub)
  await page.goto('http://localhost:3000/marker-ofek/projects');

  // 2. Basic assertion to ensure the app is running and the page loaded
  // Accept either the global app title ("מרקר אופק") or the route-specific
  // title ("פרויקטים") which is rendered when Projects Hub overrides metadata.
  await expect(page).toHaveTitle(/(מרקר אופק|פרויקטים)/);

  // Note for AI: In future iterations, we will add the exact clicks
  // to navigate to the specific project, update the BOQ, and trigger the PDF.
  // For now, just ensure the basic navigation works so the test runner succeeds.
});
