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
            // Wait for initial load (Page 10)
            await expect(page.locator('.page-container')).toHaveCount(1);
            await expect(page.locator('text=--- Page 10 ---')).toBeVisible();
        });

        test('should load next page when scrolling down', async ({ page }) => {
            // Scroll to bottom
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

            // Wait for Page 11
            await expect(page.locator('text=--- Page 11 ---')).toBeVisible({ timeout: 5000 });
            // Logic might load 12 too if we scroll too fast or window is large
            const count = await page.locator('.page-container').count();
            expect(count).toBeGreaterThanOrEqual(2);
        });

        test('should load prev page when scrolling up', async ({ page }) => {
            // Scroll to top (but we might already be there if content is short? 
            // Actually with 10 items it might need scrolling. 
            // But typically we start at top of valid content.
            // Let's ensure we are not at 0 if we want to test scroll up trigger?
            // The sentinels are at very top and very bottom.
            // If we seek to Page 10, typically in a real app we'd scroll to middle.
            // In this demo, we just append Page 10. So we are at top. 
            // So top sentinel IS visible immediately? 
            // If Top Sentinel is visible, it should trigger load-prev immediately?
            // Yes, unless we debounced or handled simulated "initial scroll position".
            // In my demo logic, I just appended.

            // If we are at top, load-prev triggers Page 9.
            // Let's check if Page 9 loads automatically or if we need to jiggle.

            await expect(page.locator('text=--- Page 9 ---')).toBeVisible({ timeout: 5000 });
        });

        test('should maintain window size (pruning)', async ({ page }) => {
            // Load 11, 12, 13, 14, 15 (Total 6 pages including 10... so 10 should be dropped)
            // MAX_PAGES is 5.

            // Scroll down repeatedly
            for (let i = 11; i <= 16; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await expect(page.locator(`text=--- Page ${i} ---`)).toBeVisible({ timeout: 5000 });
                // Wait a bit for render
                await page.waitForTimeout(500);
            }

            // Now we should have e.g. 12, 13, 14, 15, 16 (Page 10 and 11 gone?)
            // Check total count
            const containers = page.locator('.page-container');
            const count = await containers.count();
            expect(count).toBeLessThanOrEqual(5);

            // Expect Page 10 to be gone
            await expect(page.locator('text=--- Page 10 ---')).not.toBeVisible();
        });
    });
}

test.describe('Start Page Feature', () => {
    test('should start at specific page and load prev', async ({ page }) => {
        // Start at Page 4
        await page.goto('/?page=4');

        // Should show Page 4
        await expect(page.locator('text=--- Page 4 ---')).toBeVisible();

        // Since we are at the top, it MIGHT load Page 3 automatically if sentinels trigger.
        // Let's check if Page 3 appears.
        await expect(page.locator('text=--- Page 3 ---')).toBeVisible({ timeout: 5000 });

        // Scroll down to load next (Page 5)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(page.locator('text=--- Page 5 ---')).toBeVisible();
    });
});
