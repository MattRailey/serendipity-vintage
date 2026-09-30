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
  assert.deepEqual(r.condition, []);                                 // never filed on its own
  assert.deepEqual(r.text, [{ text: 'Small pinhole left cuff', hint: 'cond' }]);
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
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.text.map(x => x.text), ['Fabric is a rayon crepe']);
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
t('unplaced words carry a hint, not a destination', () => {
  const r = P('light fading on shoulders, great 70s collar, faint stain near hem');
  assert.deepEqual(r.text.map(x => x.hint), ['cond', 'note', 'cond']);
  assert.deepEqual(r.condition, []); assert.deepEqual(r.notes, []);
});
t('bag', () => {
  const r = P('width 12, height nine, depth four, strap drop twenty two');
  assert.deepEqual(r.m, { width: 12, height: 9, depth: 4, drop: 22 });
});
t('bare numbers are kept, not dropped or split', () => {
  assert.deepEqual(P('eighteen and a half').loose, [18.5]);
  assert.deepEqual(P('pit to pit 21, 29').loose, [29]);
  assert.deepEqual(P('length 27, small pinhole').loose, []);
});
// What she actually said on 2026-09-30 (iPhone), phrase by phrase
t('real session: bare names pick a box, mishearings, sizes', () => {
  assert.equal(P('Length').target, 'length');
  assert.equal(P('Shoulders').target, 'shoulder');
  assert.equal(P('The length').target, 'length');
  assert.deepEqual(P('Pit the pit is 21').m, { pit: 21 }); assert.deepEqual(P('Pit the pit is 21').text, []);
  assert.deepEqual(P('Arm pit to arm pit 20').text, []);
  const t = P('Tax size 32 x 30'); assert.equal(t.size, '32 × 30'); assert.deepEqual(t.text, []);
  const c = P("This is a Carhartt men's shirt seemingly in good condition it's a medium");
  assert.equal(c.size, 'M'); assert.deepEqual(c.text.map(x => x.text), ["This is a Carhartt men's shirt seemingly in good condition"]);
  assert.equal(P('Walk me through each box').cmd, 'walk');
});
t('punctuation from keyboard dictation', () => {
  assert.deepEqual(P('Pit to pit, 18.5').m, { pit: 18.5 });
  assert.deepEqual(P('Pit to pit, 18 and a half. Length, 27.').m, { pit: 18.5, length: 27 });
});
t('corrections said in one breath', () => {
  assert.equal(P('length 27 no wait 28').m.length, 28);
  assert.equal(P('length 27 scratch that 28').m.length, 28);
  assert.equal(P('length 27 inches, I mean 28').m.length, 28);
});
t('sound-alikes', () => {
  assert.deepEqual(P('Waste 14').m, { waist: 14 });
  assert.deepEqual(P('In seam 30').m, { inseam: 30 });
  assert.deepEqual(P('Waist 14 across').m, { waist: 14 }); assert.deepEqual(P('Waist 14 across').text, []);
});
t('sizes said naturally', () => {
  assert.equal(P("It's a medium").size, 'M');
  assert.equal(P("Men's medium").size, "Men's M");
  assert.equal(P("Women's 12").size, "Women's 12");
  assert.equal(P("waist 13 she's a size 6").size, '6'); assert.deepEqual(P("waist 13 she's a size 6").text, []);
  assert.equal(P("It's a small hole on the sleeve").size, '');     // not a size
});
t('voice commands', () => {
  for (const [said, cmd] of [['Next', 'next'], ['skip', 'next'], ['Undo', 'undo'], ['scratch that', 'undo'], ['Delete that.', 'undo'], ['stop', 'stop'], ["I'm done", 'stop'], ['walk me through', 'walk']])
    assert.equal(P(said).cmd, cmd, said);
});
t('"notes" and "flaw" send words to those boxes', () => {
  const n = P('notes made in USA, union label');
  assert.equal(n.target, 'notes'); assert.deepEqual(n.notes, ['Made in USA', 'Union label']);
  const f = P('flaw small hole left cuff'); assert.equal(f.target, 'condition'); assert.deepEqual(f.condition, ['Small hole left cuff']);
  assert.equal(P('Notes').target, 'notes'); assert.equal(P('Condition').target, 'condition');
  assert.deepEqual(P('made in USA union label', 'notes').notes, ['Made in USA union label']);   // already talking into Notes
  assert.deepEqual(P('Has shoulder pads').text.map(x => x.text), ['Has shoulder pads']);         // "shoulder" inside a sentence isn't a box
});
t('keeps her capitals', () => {
  assert.deepEqual(P("It's a Pendleton").text.map(x => x.text), ["It's a Pendleton"]);
});
console.log(n + ' parser tests passed' + (process.exitCode ? ' (some failed)' : ''));
