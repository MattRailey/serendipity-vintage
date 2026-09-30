// The in-app camera: no "Use Photo" step. Uses Chromium's fake camera.
const { test, expect } = require('@playwright/test');
const { mockNet, openApp } = require('./helpers');

test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test('piece: shutter saves each photo and moves on to the next shot, no confirm step', async ({ page }) => {
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const net = await mockNet(page); await openApp(page, { camera: true });
  await page.click('#fab'); await page.click('[data-add="piece"]');
  await expect(page.locator('#piece-sheet')).toHaveClass(/open/);
  const code = (await page.textContent('#pc-code')).trim();
  await page.click('[data-shot="front"]');
  await expect(page.locator('.cam')).toBeVisible();
  await expect(page.locator('.cam-chips .on')).toHaveText('Front');
  await page.waitForFunction(() => document.querySelector('.cam video').videoWidth > 0);
  await page.click('.cam-shutter');
  await expect(page.locator('.cam-chips .on')).toHaveText('Back');
  await page.click('.cam-shutter');
  await expect(page.locator('.cam-chips .on')).toHaveText('Brand tag');
  await page.click('.cam-shutter'); await page.click('.cam-shutter');
  await expect(page.locator('.cam-chips .on')).toHaveText('Detail');
  await expect(page.locator('.cam-count')).toHaveText('4 photos saved');
  await page.click('.cam-done');
  await expect(page.locator('.cam')).toHaveCount(0);
  await expect(page.locator('#pc-photos figure img')).toHaveCount(4);
  await page.waitForTimeout(2500);
  const paths = net.uploads.map(u => u.path);
  for (const [n, k] of [['01', 'front'], ['02', 'back'], ['03', 'tag'], ['04', 'care']]) expect(paths).toContain(`/Workspace/Serendipity Vintage/pieces/${code}/${code} ${n} ${k}.jpg`);
  expect(net.uploads.find(u => u.path.endsWith('front.jpg')).size).toBeGreaterThan(1000);
  expect(errs).toEqual([]);
});

test('receipt: one tap of the shutter saves it and closes the camera', async ({ page }) => {
  const net = await mockNet(page); await openApp(page, { camera: true });
  await page.click('#fab'); await page.click('[data-add="haul"]');
  await page.click('#hl-receipt-btn');
  await page.waitForFunction(() => document.querySelector('.cam video').videoWidth > 0);
  await page.click('.cam-shutter');
  await expect(page.locator('.cam')).toHaveCount(0);
  await expect(page.locator('#hl-receipt-label')).toContainText('Receipt saved');
});

test('camera turned off: says so and offers the phone camera', async ({ page, context }) => {
  await mockNet(page); await openApp(page, { camera: true });
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); });
  await page.click('#fab'); await page.click('[data-add="piece"]');
  await page.click('[data-shot="front"]');
  await expect(page.locator('.cam-msg')).toContainText('turned off');
  const fc = page.waitForEvent('filechooser'); await page.click('.cam-fb'); await fc;
  await expect(page.locator('.cam')).toHaveCount(0);
});
