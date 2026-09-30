// End-to-end checks in a phone-sized Chromium with a fake Dropbox. Nothing real is contacted.
const { test, expect } = require('@playwright/test');
const { JPG, RECEIPT, mockNet, openApp, baseStore } = require('./helpers');

function watchErrors(page) { const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); }); return errs; }
const ym = () => { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); };

test('starts empty without errors', async ({ page }) => {
  const errs = watchErrors(page); await mockNet(page); await openApp(page);
  await expect(page.locator('#piece-list')).toContainText('No pieces yet');
  for (const p of ['hauls', 'money', 'settings', 'pieces']) await page.click(`.tabs [data-panel="${p}"]`);
  expect(errs).toEqual([]);
});

test('new haul: receipt, new store, pieces with codes and split cost, synced to Dropbox', async ({ page }) => {
  const errs = watchErrors(page); const net = await mockNet(page); await openApp(page);
  await page.click('#fab'); await page.click('[data-add="haul"]');
  await expect(page.locator('#haul-sheet')).toHaveClass(/open/);
  const fc = page.waitForEvent('filechooser'); await page.click('#hl-receipt-btn'); await (await fc).setFiles(RECEIPT);
  await expect(page.locator('#hl-receipt-label')).toContainText('Receipt saved');
  await page.selectOption('#hl-store', '__new');
  await page.fill('#st-name', 'Goodwill'); await page.fill('#st-town', 'La Grande'); await page.fill('#st-miles', '12'); await page.click('#st-save');
  await expect(page.locator('#hl-miles')).toHaveValue('12');
  await page.fill('#hl-total', '31'); await page.fill('#hl-count', '4'); await page.click('#hl-save');
  await expect(page.locator('#hl-pieces .tape button')).toHaveCount(4);
  await expect(page.locator('#hl-pieces .tape button').first()).toContainText(ym() + '-001');
  await page.waitForTimeout(2500);
  const r = net.remote;
  expect(r.items.length).toBe(4); expect(r.hauls.length).toBe(1); expect(r.stores[0].roundTrip).toBe(12);
  expect(r.items.map(i => i.cost).reduce((a, b) => a + b, 0)).toBeCloseTo(31, 5);
  expect(net.uploads.some(u => u.path.startsWith('/Vintage Shop/receipts/') && u.size > 1000)).toBe(true);
  // a second haul the same day doesn't double-count the drive
  await page.click('#hl-close'); await page.click('#fab'); await page.click('[data-add="haul"]');
  await page.selectOption('#hl-store', { label: 'Goodwill · La Grande' });
  await expect(page.locator('#hl-miles')).toHaveValue('0');
  expect(errs).toEqual([]);
});

test('piece: dictation fills measurements, photos go to the piece folder', async ({ page }) => {
  const errs = watchErrors(page); const net = await mockNet(page); await openApp(page);
  await page.click('#fab'); await page.click('[data-add="piece"]');
  await expect(page.locator('#piece-sheet')).toHaveClass(/open/);
  const code = (await page.textContent('#pc-code')).trim();
  await page.click('[data-type="top"]');
  await page.fill('#pc-dict', 'Tag size medium, pit to pit eighteen and a half, length twenty seven, shoulders 17, sleeve 24 and a quarter, small pinhole near left cuff');
  await page.locator('#pc-dict').blur();
  await expect(page.locator('[data-m="pit"]')).toHaveValue('18½"');
  await expect(page.locator('[data-m="sleeve"]')).toHaveValue('24¼"');
  await expect(page.locator('#pc-size')).toHaveValue('M');
  await expect(page.locator('#pc-cond')).toHaveValue(/Small pinhole near left cuff/);
  for (const shot of ['front', 'back']) { const fc = page.waitForEvent('filechooser'); await page.click(`[data-shot="${shot}"]`); await (await fc).setFiles(JPG); await expect(page.locator('#pc-photos figure img')).toHaveCount(shot === 'front' ? 1 : 2); }
  await expect(page.locator('[data-shot="tag"]')).toHaveClass(/next/);
  await page.waitForTimeout(2500);
  const paths = net.uploads.map(u => u.path);
  expect(paths).toContain(`/Vintage Shop/pieces/${code}/${code} 01 front.jpg`);
  expect(paths).toContain(`/Vintage Shop/pieces/${code}/${code} 02 back.jpg`);
  const it = net.remote.items.find(i => i.code === code);
  expect(it.measurements).toEqual({ pit: 18.5, length: 27, shoulder: 17, sleeve: 24.25 });
  expect(it.photos.map(p => p.kind)).toEqual(['front', 'back']);
  await expect(page.locator('#pc-ready')).toContainText('still missing brand tag, care tag');
  await page.click('#pc-ready');
  await expect(page.locator('#pc-status')).toHaveValue('ready');
  expect(errs).toEqual([]);
});

test('Claude listing shows Etsy checks and Vinted tab; crosslisting warns after a sale', async ({ page }) => {
  const errs = watchErrors(page); await mockNet(page);
  const item = { id: 'p1', code: '2609-001', status: 'draft', type: 'top', acquired: '2026-09-02', cost: 7.75, updatedAt: 5, photos: [], measurements: { pit: 21 },
    listing: { etsy: { title: '70s Western Pearl Snap Shirt, Brown Plaid Cotton Blend, Men\'s Medium', tags: ['1970s western shirt', 'pearl snap shirt', 'rodeo shirt', 'brown plaid shirt', 'cowboy shirt', 'seventies shirt', 'western wear', 'yellowstone style', 'ranch shirt', 'snap front shirt', 'mens medium shirt', 'retro plaid', 'a tag that is far too long'], attributes: { 'When made': '1970-1979', Color: 'Brown' }, description: 'Vintage 1970s…' },
      vinted: { title: '70s Western Pearl Snap Shirt Brown Plaid M', description: 'Great shirt #vintage #western', condition: 'Very good', brand: 'Kmart', size: 'M' },
      price: { suggested: 48, low: 40, high: 58, vinted: 42 }, research: { era: '1970s', brand: 'Kmart', summary: 'Union label, 65/35 poly cotton.' } } };
  await openApp(page, { store: baseStore({ items: [item] }) });
  await page.click('[data-id="p1"]');
  await expect(page.locator('.listing .checks')).toContainText('✕ 1 tag over 20 characters');
  await expect(page.locator('.listing .checks')).toContainText('✓ 13 tags');
  await page.click('[data-lt="vinted"]'); await expect(page.locator('.listing')).toContainText('Very good');
  await page.click('[data-tog="etsy"]'); await page.click('[data-tog="vinted"]');
  await expect(page.locator('#pc-status')).toHaveValue('listed');
  await expect(page.locator('[data-v="vinted"] .sub')).toContainText('$42');
  await page.selectOption('#pc-soldVia', 'etsy');
  await expect(page.locator('#pc-stale')).toContainText('take it down on Vinted');
  await page.click('#pc-unlist'); await expect(page.locator('#pc-stale')).toBeHidden();
  await page.fill('#pc-soldPrice', '48'); await page.fill('#pc-fees', '6.10'); await page.locator('#pc-fees').blur();
  await expect(page.locator('#pc-profit')).toContainText('profit $34.15');
  expect(errs).toEqual([]);
});

test('money: year totals, mileage and to-dos', async ({ page }) => {
  const errs = watchErrors(page); await mockNet(page);
  const s = baseStore({
    hauls: [{ id: 'h1', date: '2026-03-04', total: 20, miles: 40, updatedAt: 1 }],
    items: [
      { id: 'a', code: '2603-001', haulId: 'h1', cost: 10, status: 'sold', soldVia: 'etsy', soldAt: '2026-05-01', soldPrice: 50, fees: 5, shipCost: 0, acquired: '2026-03-04', updatedAt: 1 },
      { id: 'b', code: '2603-002', haulId: 'h1', cost: 10, status: 'listed', live: { vinted: { at: '2026-04-01', price: 30 } }, acquired: '2026-03-04', updatedAt: 1 },
      { id: 'c', code: '2604-001', status: 'sold', soldVia: 'consign', soldAt: '2026-06-01', soldPrice: 20, acquired: '2026-04-01', updatedAt: 1 }],
    expenses: [{ id: 'e1', date: '2026-02-01', category: 'shipsup', amount: 12, updatedAt: 1 }] });
  await openApp(page, { store: s });
  await page.click('.tabs [data-panel="money"]'); await page.selectOption('#money-year', '2026');
  // 70 sales − 5 fees − 10 cogs − 12 expenses − 40 mi × 0.725 = 14
  await expect(page.locator('.kpi.hero b')).toHaveText('$14');
  await expect(page.locator('#money-body')).toContainText('1 sold piece has no cost: 2604-001');
  await expect(page.locator('#money-body')).toContainText('1 haul has no receipt photo');
  expect(errs).toEqual([]);
});

test('sync merges field edits from two devices', async ({ page }) => {
  const errs = watchErrors(page);
  const local = baseStore({ items: [{ id: 'p1', code: '2609-001', status: 'new', title: 'Plaid shirt', updatedAt: 100, ft: { title: 100 } }] });
  const remote = baseStore({ updatedAt: 200, items: [{ id: 'p1', code: '2609-001', status: 'draft', title: 'Shirt', listing: { etsy: { title: 'From Claude' } }, updatedAt: 200, ft: { status: 200, listing: 200, title: 50 } }] });
  const net = await mockNet(page, { remote });
  await openApp(page, { store: local });
  await page.waitForTimeout(2000);
  const it = net.remote.items[0];
  expect(it.title).toBe('Plaid shirt'); expect(it.status).toBe('draft'); expect(it.listing.etsy.title).toBe('From Claude');
  expect(errs).toEqual([]);
});
