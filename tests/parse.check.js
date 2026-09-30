// node tests/parse.check.js — checks the dictation parser on the kinds of things she'll say
const assert = require('assert');
const { parseDictation: P, wordsToNumbers: W } = require('../js/speech.js');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; } };

t('number words', () => {
  assert.equal(W('eighteen and a half'), '18.5');
  assert.equal(W('twenty-seven and three quarters'), '27.75');
  assert.equal(W('18 1/2'), '18.5');
  assert.equal(W('eighteen point five'), '18.5');
  assert.equal(W('twenty two and a quarter'), '22.25');
  assert.equal(W('thirty'), '30');
  assert.equal(W('18½'), '18.5');
});
t('basic top', () => {
  const r = P('pit to pit eighteen and a half, length twenty seven, sleeve twenty four, small pinhole left cuff');
  assert.deepEqual(r.m, { pit: 18.5, length: 27, sleeve: 24 });
  assert.deepEqual(r.condition, ['Small pinhole left cuff']);
});
t('no commas (raw speech)', () => {
  const r = P('pit to pit 21 length 29 shoulders 18 and a half sleeve 25');
  assert.deepEqual(r.m, { pit: 21, length: 29, shoulder: 18.5, sleeve: 25 });
});
t('pants + tag size', () => {
  const r = P('Tag size 32 x 30. Waist 15 and a half, rise 11, inseam 29 and a quarter, leg opening 8, thigh 11.');
  assert.equal(r.size, '32 × 30');
  assert.deepEqual(r.m, { waist: 15.5, rise: 11, inseam: 29.25, leg: 8, thigh: 11 });
});
t('back rise before rise', () => {
  const r = P('front rise 12, back rise 15');
  assert.deepEqual(r.m, { rise: 12, backRise: 15 });
});
t('number before name', () => {
  const r = P('18 inches pit to pit and 26 long');
  assert.deepEqual(r.m, { pit: 18, length: 26 });
});
t('with "is" and units', () => {
  const r = P('Waist is 13 inches. Length is 41 inches. Fabric is a rayon crepe.');
  assert.deepEqual(r.m, { waist: 13, length: 41 });
  assert.deepEqual(r.notes, ['Fabric is a rayon crepe']);
});
t('sizes', () => {
  assert.equal(P('tag size medium').size, 'M');
  assert.equal(P('marked large').size, 'L');
  assert.equal(P('size 12 petite').size, '12 Petite');
  assert.equal(P('tagged extra large pit to pit 24').size, 'XL');
  assert.equal(P('tagged extra large pit to pit 24').m.pit, 24);
  assert.equal(P('one size fits most').size, 'One size');
});
t('correction wins', () => {
  assert.equal(P('length 27, no wait, length 28').m.length, 28);
});
t('condition vs notes', () => {
  const r = P('light fading on shoulders, great 70s collar, faint stain near hem');
  assert.ok(r.condition.includes('Light fading on shoulders'));
  assert.ok(r.condition.includes('Faint stain near hem'));
});
t('bag', () => {
  const r = P('width 12, height nine, depth four, strap drop twenty two');
  assert.deepEqual(r.m, { width: 12, height: 9, depth: 4, drop: 22 });
});
console.log(n + ' parser tests passed' + (process.exitCode ? ' (some failed)' : ''));
