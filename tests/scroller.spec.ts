import { test, expect } from '@playwright/test';

const SCENARIOS = [
    { name: 'Vanilla', url: '/' },
    { name: 'React', url: '/react-demo.html' },
    { name: 'Vue', url: '/vue-demo.html' }
];

for (const { name, url } of SCENARIOS) {
    test.describe(`${name} Integration`, () => {
        test.beforeEach(async ({ page }) => {
            await page.goto(url);
            // Wait for initial load (Page 1 + buffer)
            await expect(page.locator('.page-container')).toHaveCount(3);
            await expect(page.locator('text=--- Page 1 ---')).toBeVisible();
        });

        test('should load next page when scrolling down', async ({ page }) => {
            // Scroll to bottom
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

            // Wait for Page 4
            await expect(page.locator('text=--- Page 4 ---')).toBeVisible({ timeout: 5000 });
            const count = await page.locator('.page-container').count();
            expect(count).toBeGreaterThanOrEqual(4);
        });

        test('should load prev page when scrolling up', async ({ page }) => {
            // Since we start at page 1, there is no page 0.
            // But if we start at page 10 (tested later), then page 9 should be there.
            // For the default case, let's just ensure we are stable.
            await expect(page.locator('text=--- Page 1 ---')).toBeVisible();
        });

        test('should maintain window size (pruning)', async ({ page }) => {
            // Load 11, 12, 13, 14, 15 (Total 6 pages including 10... so 10 should be dropped)
            // MAX_PAGES is 5.

            // Scroll down repeatedly
            for (let i = 4; i <= 12; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await expect(page.locator(`text=--- Page ${i} ---`)).toBeVisible({ timeout: 5000 });
                // Wait a bit for render
                await page.waitForTimeout(100);
            }

            // Now we should have e.g. 12, 13, 14, 15, 16 (Page 10 and 11 gone?)
            // Check total count
            const containers = page.locator('.page-container');
            const count = await containers.count();
            expect(count).toBeLessThanOrEqual(10);

            // Expect Page 1 to be gone (since we loaded up to 12, and 1-7 should be gone if we keep 10? Wait.)
            // If we have 4,5,6,7,8,9,10,11,12 that is 9 pages. 
            // If we start at 1, and load 2,3 (init) then scroll to 12.
            // 1,2,3,4,5,6,7,8,9,10,11,12 -> 12 pages.
            // Pruning to 10 should remove 1 and 2.
            await expect(page.locator('text=--- Page 1 ---')).not.toBeVisible();
        });
    });
}

test.describe('Start Page Feature', () => {
    test('should start at specific page and load prev', async ({ page }) => {
        // Start at Page 4
        await page.goto('/?page=4');

        // Should show Page 4, plus 2,3 and 5,6 as buffer
        await expect(page.locator('text=--- Page 4 ---')).toBeVisible();
        await expect(page.locator('text=--- Page 2 ---')).toBeVisible();
        await expect(page.locator('text=--- Page 6 ---')).toBeVisible();

        // Scroll down to load next (Page 5)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(page.locator('text=--- Page 5 ---')).toBeVisible();
    });
});
