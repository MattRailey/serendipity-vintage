// Dictation accuracy, the "Just heard" tray, the mic session, and the Feed / Cards / List pieces views.
const { test, expect } = require('@playwright/test');
const { mockNet, openApp, baseStore } = require('./helpers');

function watchErrors(page) { const errs = []; page.on('pageerror', e => errs.push(e.message)); return errs; }
// A fake speech recognizer the test can talk through. It counts how many times the phone was asked to start.
async function fakeMic(page) {
  await page.addInitScript(() => {
    window.__starts = 0;
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__starts++; window.__rec = this; this.started = true; }
      stop() { this.started = false; setTimeout(() => { if (this.pending) { const p = this.pending; this.pending = null; window.__say([[p, true]]); } this.onend && this.onend(); }, 0); }
    };
    // results = [[text, isFinal], …] — the whole list so far, like a real recognizer sends
    window.__say = results => window.__rec.onresult({ resultIndex: 0, results: results.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) });
    window.__phoneEnds = () => { window.__rec.started = false; window.__rec.onend(); };
  });
}
const newPiece = async page => { await page.click('#fab'); await page.click('[data-add="piece"]'); await page.click('[data-type="top"]'); };

test('typed dictation: a number fixed by hand is not overwritten by later phrases', async ({ page }) => {
  const errs = watchErrors(page); await mockNet(page); await openApp(page); await newPiece(page);
  await page.fill('#pc-dict', 'pit to pit eighteen'); await page.locator('#pc-dict').blur();
  await expect(page.locator('[data-m="pit"]')).toHaveValue('18"');
  await page.locator('[data-m="pit"]').focus(); await page.fill('[data-m="pit"]', '20'); await page.locator('[data-m="pit"]').blur();
  await page.fill('#pc-dict', 'pit to pit eighteen, length twenty seven'); await page.locator('#pc-dict').blur();
  await expect(page.locator('[data-m="length"]')).toHaveValue('27"');
  await expect(page.locator('[data-m="pit"]')).toHaveValue('20"');      // still her correction
  expect(errs).toEqual([]);
});

test('a number said with no name waits for a choice, and Undo puts everything back', async ({ page }) => {
  const errs = watchErrors(page); await mockNet(page); await openApp(page); await newPiece(page);
  await page.fill('#pc-dict', 'eighteen and a half'); await page.locator('#pc-dict').blur();
  await expect(page.locator('.hloose')).toContainText('18½');
  await expect(page.locator('[data-m="pit"]')).toHaveValue('');
  await page.click('.hloose [data-k="pit"]');
  await expect(page.locator('[data-m="pit"]')).toHaveValue('18½"');
  await page.fill('#pc-dict', 'eighteen and a half, tag size large, faint stain on hem'); await page.locator('#pc-dict').blur();
  await expect(page.locator('#pc-size')).toHaveValue('L');
  await expect(page.locator('#pc-cond')).toHaveValue(/Faint stain on hem/);
  await page.click('#pc-heard [data-undo]');
  await expect(page.locator('#pc-size')).toHaveValue(''); await expect(page.locator('#pc-cond')).toHaveValue('');
  expect(errs).toEqual([]);
});

test('a condition line can be moved to notes from the tray', async ({ page }) => {
  await mockNet(page); await openApp(page); await newPiece(page);
  await page.fill('#pc-dict', 'small pinhole left cuff'); await page.locator('#pc-dict').blur();
  await expect(page.locator('#pc-cond')).toHaveValue(/Small pinhole left cuff/);
  await page.click('#pc-heard [data-mv="0"]');
  await expect(page.locator('#pc-cond')).toHaveValue(''); await expect(page.locator('#pc-notes')).toHaveValue(/Small pinhole left cuff/);
});

test('mic: one session survives the phone ending it, says nothing twice, and walk-through fills boxes in order', async ({ page }) => {
  const errs = watchErrors(page); await fakeMic(page); await mockNet(page); await openApp(page); await newPiece(page);
  await page.click('#pc-mic');
  await expect(page.locator('#pc-mic')).toHaveClass(/on/);
  // the phone repeats earlier phrases in later events; each should be applied once
  await page.evaluate(() => window.__say([['pit to pit eighteen and a half', true]]));
  await page.evaluate(() => window.__say([['pit to pit eighteen and a half', true], ['length twenty seven', true], ['sleeve twen', false]]));
  await expect(page.locator('[data-m="pit"]')).toHaveValue('18½"');
  await expect(page.locator('[data-m="length"]')).toHaveValue('27"');
  await expect(page.locator('[data-m="sleeve"]')).toHaveValue('');           // still being spoken: not applied yet
  await expect(page.locator('#pc-dict')).toHaveValue('pit to pit eighteen and a half, length twenty seven');
  // the phone ends recognition early: it restarts itself, the button stays on
  await page.evaluate(() => window.__phoneEnds());
  await page.waitForFunction(() => window.__starts === 2);
  await expect(page.locator('#pc-mic')).toHaveClass(/on/);
  // walk-through: bare numbers go to the next empty box; "skip" moves on
  await page.click('#pc-walk');
  await expect(page.locator('#pc-mic-label')).toContainText('Listening for Shoulders');
  await page.evaluate(() => window.__say([['seventeen', true]]));
  await expect(page.locator('[data-m="shoulder"]')).toHaveValue('17"');
  await expect(page.locator('#pc-mic-label')).toContainText('Listening for Sleeve');
  await page.evaluate(() => window.__say([['seventeen', true], ['skip', true]]));
  await expect(page.locator('#pc-mic-label')).toContainText('Listening… tap to stop');   // no empty box left after Sleeve
  await expect(page.locator('[data-m="sleeve"]')).toHaveValue('');
  // stop: button off, and the session is not restarted
  await page.click('#pc-mic');
  await expect(page.locator('#pc-mic')).not.toHaveClass(/on/);
  await page.waitForTimeout(400); expect(await page.evaluate(() => window.__starts)).toBe(2);
  expect(errs).toEqual([]);
});

test('mic: if it is refused once, it is not asked for again this visit', async ({ page }) => {
  await fakeMic(page); await mockNet(page); await openApp(page); await newPiece(page);
  await page.click('#pc-mic'); await page.evaluate(() => window.__rec.onerror({ error: 'not-allowed' }));
  await expect(page.locator('.toast.show, #toast.show')).toContainText('Microphone is off');
  await page.click('#pc-mic'); expect(await page.evaluate(() => window.__starts)).toBe(1);
  await expect(page.locator('#pc-dict')).toBeFocused();       // goes to the keyboard's own mic instead
});

test('pieces: Feed, Cards and List views, remembered', async ({ page }) => {
  const errs = watchErrors(page); await mockNet(page);
  const items = [1, 2, 3].map(n => ({ id: 'p' + n, code: '2609-00' + n, status: n === 3 ? 'sold' : 'new', soldPrice: 40, size: 'M', title: 'Piece ' + n, acquired: '2026-09-02', updatedAt: n, photos: [], measurements: { pit: 20 } }));
  await openApp(page, { store: baseStore({ items }) });
  await page.click('#status-chips [data-f="all"]');
  await expect(page.locator('#piece-list .pcard')).toHaveCount(3);
  await page.click('#view-seg [data-view="feed"]'); await expect(page.locator('#piece-list .post')).toHaveCount(3);
  await expect(page.locator('#piece-list .post').first()).toContainText('Pit to pit 20"');
  await page.click('#view-seg [data-view="list"]'); await expect(page.locator('#piece-list .lr')).toHaveCount(3);
  await page.reload(); await page.waitForSelector('.tabs button.active');
  await expect(page.locator('#view-seg [data-view="list"]')).toHaveClass(/on/);
  await page.click('#piece-list .lr >> nth=0'); await expect(page.locator('#piece-sheet')).toHaveClass(/open/);
  expect(errs).toEqual([]);
});

test('mic: tap a box, speak, tap the next box straight away — the words go to the box they were said for', async ({ page }) => {
  const errs = watchErrors(page); await fakeMic(page); await mockNet(page); await openApp(page); await newPiece(page);
  await page.click('#pc-mic');
  await page.click('.meas:has([data-m="sleeve"])');
  await expect(page.locator('.meas.target')).toContainText('Sleeve');
  await page.waitForFunction(() => window.__starts === 2);                   // tapping briefly restarts the listener
  // she has spoken but the phone hasn't closed the phrase yet; she taps the next box
  await page.evaluate(() => { window.__rec.pending = 'twenty four and a half'; window.__say([['twenty four and a half', false]]); });
  await page.click('.meas:has([data-m="length"])');
  await expect(page.locator('[data-m="sleeve"]')).toHaveValue('24½"');
  await expect(page.locator('#pc-mic-label')).toContainText('Listening for Length');
  await expect(page.locator('[data-m="length"]')).toHaveValue('');
  await page.waitForFunction(() => window.__starts === 3);                   // session carried on
  await page.evaluate(() => window.__say([['twenty seven', true]]));
  await expect(page.locator('[data-m="length"]')).toHaveValue('27"');
  await expect(page.locator('#pc-mic')).toHaveClass(/on/);
  expect(errs).toEqual([]);
});
