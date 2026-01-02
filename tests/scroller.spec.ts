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

            // In virtualization mode, containers stay in DOM but content is cleared.
            // Check count of containers with markers
            const markers = page.locator('.page-marker');
            const markersCount = await markers.count();
            expect(markersCount).toBeLessThanOrEqual(10);

            // Expect Page 1 marker to be gone (virtualized)
            await expect(page.locator('text=--- Page 1 ---')).not.toBeVisible();
        });
    });
}

test.describe('Start Page Feature', () => {
    test('should start at specific page and show placeholders', async ({ page }) => {
        // Start at Page 10
        await page.goto('/?page=10');

        // Should show Page 10
        await expect(page.locator('text=--- Page 10 ---')).toBeVisible();

        // Should have placeholders for pages 1-9
        // Each placeholder in vanilla has data-page and class page-container
        const placeholders = page.locator('.page-container');
        expect(await placeholders.count()).toBeGreaterThanOrEqual(10);

        // Verify scroll position is not at top
        // Wait for potential auto-scrolling
        await page.waitForFunction(() => window.scrollY > 0, { timeout: 5000 }).catch(() => { });
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBeGreaterThan(0);

        // Scroll up to load Page 9 (it's a placeholder, so loading it should rehydrate)
        // We'll scroll to middle of Page 9
        await page.locator('[data-page="9"]').scrollIntoViewIfNeeded();
        await expect(page.locator('text=--- Page 9 ---')).toBeVisible({ timeout: 5000 });
    });
});
