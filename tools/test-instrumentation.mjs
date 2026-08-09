#!/usr/bin/env node
/** Regression tests for the instrumentation parser: node --test tools/ */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInstrumentation, formatOboeScoring, requiredInstruments,
  mentionsOboeFamily, fromCategoryName,
} from '../lib/instrumentation.mjs';

const scoring = (text) => formatOboeScoring(parseInstrumentation(text));

test('counts plain oboe parts', () => {
  assert.equal(scoring('oboe, violin, viola, cello'), 'oboe');
  assert.equal(scoring('2 oboes, 2 clarinets, 2 horns'), 'two oboes');
  assert.equal(scoring('3 oboes, strings'), 'three oboes');
  assert.equal(scoring('24 oboes, 12 bassoons'), '24 oboes');
});

test('distinguishes members of the oboe family', () => {
  assert.equal(scoring("oboe d'amore, strings, continuo"), "oboe d'amore");
  assert.equal(scoring('flute, oboe da caccia, harpsichord'), 'oboe da caccia');
  assert.equal(scoring('cor anglais, harp'), 'english horn');
  assert.equal(scoring('bass oboe, heckelphone'), 'bass oboe, heckelphone');
});

test('reads alternative and foreign names', () => {
  assert.equal(scoring('4 Oboes, 2 Corni Inglesi'), 'four oboes, two english horns');
  assert.equal(scoring('2 Hautbois'), 'two oboes');
  assert.equal(scoring('Englischhorn, Streicher'), 'english horn');
});

test('spells out number words in the input', () => {
  assert.equal(scoring('two oboes and english horn'), 'two oboes, english horn');
});

test('attaches doublings to the instrument that doubles', () => {
  assert.equal(
    scoring('3 oboes (3rd doubling english horn), 2 clarinets'),
    'three oboes (3rd doubling english horn)');
  assert.equal(
    scoring("2 oboes (2nd doubling oboe d'amore), english horn"),
    "two oboes (2nd doubling oboe d'amore), english horn");
});

test('a doubled instrument still counts as required', () => {
  const dvorak = parseInstrumentation('2 oboes (2nd doubling english horn)');
  assert.deepEqual(requiredInstruments(dvorak), ['oboe', 'englishHorn']);
  // ...but it does not inflate the number of players.
  assert.equal(dvorak.counts.oboe, 2);
  assert.equal(dvorak.counts.englishHorn ?? 0, 0);
});

test('ignores works with no oboe-family instrument', () => {
  assert.equal(scoring('soprano, alto, mixed chorus (SATB), orchestra'), '');
  assert.equal(scoring('piano solo'), '');
  assert.equal(mentionsOboeFamily('violin, viola, cello'), false);
  assert.equal(mentionsOboeFamily('2 oboes, strings'), true);
});

test('does not mistake d\'amore or da caccia for a plain oboe', () => {
  const p = parseInstrumentation("oboe d'amore");
  assert.equal(p.counts.oboe ?? 0, 0);
  assert.equal(p.counts.oboeDamore, 1);
});

test('flags a bare plural as an inferred count', () => {
  const p = parseInstrumentation('oboes, bassoons, strings');
  assert.ok(p.uncertain.includes('oboe'));
  assert.equal(p.counts.oboe, 2);
});

test('parses IMSLP category names', () => {
  assert.deepEqual(fromCategoryName('For 2 oboes, english horn (arr)'),
    { text: '2 oboes, english horn', arrangement: true });
  assert.deepEqual(fromCategoryName('For oboe, violin, viola, cello'),
    { text: 'oboe, violin, viola, cello', arrangement: false });
});
