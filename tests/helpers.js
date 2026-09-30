// Shared test helpers: a fake Dropbox and a way to open the app with data already on the device.
const fs = require('fs'), path = require('path');
const APP = '/vintage-shop.html';
const JPG = path.join(__dirname, 'fixtures', 'shirt.jpg');
const RECEIPT = path.join(__dirname, 'fixtures', 'receipt.jpg');

async function mockNet(page, opts = {}) {
  const net = { uploads: [], remote: opts.remote || null, rev: 1 };
  await page.context().route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('localhost')) return route.continue();
    if (u.includes('fonts.g')) return route.fulfill({ status: 200, body: '' });
    const h = route.request().headers();
    if (u.includes('/2/files/download')) {
      const arg = JSON.parse(h['dropbox-api-arg']);
      if (arg.path.endsWith('vintage-shop.json') && net.remote)
        return route.fulfill({ status: 200, body: JSON.stringify(net.remote), headers: { 'Dropbox-API-Result': JSON.stringify({ rev: 'r' + net.rev }) } });
      return route.fulfill({ status: 409, body: '{}' });
    }
    if (u.includes('/2/files/upload')) {
      const arg = JSON.parse(h['dropbox-api-arg']); const raw = route.request().postDataBuffer();
      net.uploads.push({ path: arg.path, size: raw ? raw.length : 0, mode: arg.mode });
      if (arg.path.endsWith('vintage-shop.json')) { net.remote = JSON.parse(raw.toString('utf8')); net.rev++; }
      return route.fulfill({ status: 200, body: JSON.stringify({ path_display: arg.path }) });
    }
    if (u.includes('get_thumbnail_v2')) return route.fulfill({ status: 200, body: fs.readFileSync(JPG), contentType: 'image/jpeg' });
    return route.abort();
  });
  return net;
}
async function openApp(page, { store = null, dropbox = true, extra = {} } = {}) {
  await page.goto(APP + '?t=blank');
  await page.evaluate(async ({ store, dropbox, extra }) => {
    localStorage.clear();
    await new Promise(r => { const q = indexedDB.deleteDatabase('tamarack_vintage'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    if (store) localStorage.setItem('tamarack_vintage_store_v1', JSON.stringify(store));
    if (dropbox) localStorage.setItem('tamarack_vintage_dropbox_tokens', JSON.stringify({ access_token: 'test', expires_at: Date.now() + 3600e3 }));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, { store, dropbox, extra });
  await page.goto(APP);
  await page.waitForSelector('.tabs button.active');
}
function baseStore(extra = {}) { return Object.assign({ format: 'tamarack-vintage', version: 1, updatedAt: 1, items: [], hauls: [], expenses: [], stores: [], settings: {} }, extra); }
module.exports = { APP, JPG, RECEIPT, mockNet, openApp, baseStore };
