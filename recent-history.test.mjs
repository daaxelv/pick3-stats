// Run with: node --test recent-history.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import History from './recent-history.js';

const { DRAW_OPTIONS, normalizeSettings, normalizeResults, mergeResults, cooldown } = History;
const result = (day, draw, combo, fireball = '') => ({
  date: '2026-09-' + String(day).padStart(2, '0'), draw, combo, fireball
});
const sequence = count => Array.from({ length: count }, (_, i) => ({
  date: '2026-08-' + String(Math.floor(i / 2) + 1).padStart(2, '0'),
  draw: i % 2 ? 'EVE' : 'MID', combo: String(i).padStart(3, '0'), fireball: ''
}));

test('browser script exposes the same public API', () => {
  const context = { window: {} };
  runInNewContext(readFileSync(new URL('./recent-history.js', import.meta.url), 'utf8'), context);
  assert.deepEqual(Object.keys(context.window.Pick3History), Object.keys(History));
  assert.equal(context.window.Pick3History.normalizeSettings().draws, 7);
});

test('settings default ON for seven draws and accept only supported lengths', () => {
  assert.deepEqual(DRAW_OPTIONS, [1, 3, 7, 14, 30]);
  for (const input of [undefined, null, false, [], {}, 'invalid']) {
    assert.deepEqual(normalizeSettings(input), { enabled: true, draws: 7, allDraws: false });
  }
  for (const draws of DRAW_OPTIONS) {
    for (const value of [draws, String(draws)]) assert.equal(normalizeSettings({ draws: value }).draws, draws);
  }
  for (const draws of [-1, 0, 2, 31, 1.5, true, null, [], {}, '', 'no', Infinity, NaN]) {
    assert.equal(normalizeSettings({ draws }).draws, 7);
  }
  assert.deepEqual(normalizeSettings({ enabled: false, draws: '14', allDraws: true }), {
    enabled: false, draws: 14, allDraws: true
  });
  assert.equal(normalizeSettings({ enabled: 'false', allDraws: 'true' }).enabled, true);
  assert.equal(normalizeSettings({ allDraws: 'true' }).allDraws, false);
});

test('canonical and normalized rows preserve leading zeroes, order MID before EVE and deduplicate corrections', () => {
  const source = [
    { game: 'P3', date: '2026-09-02', draw: 'EVE', digits: '0-0-7', fireball: '0', source: 'feed' },
    result(2, 'MID', '112'), result(1, 'EVE', '234'), result(2, 'MID', '122', '9')
  ];
  const snapshot = JSON.stringify(source);
  assert.deepEqual(normalizeResults(source, { strict: true }), [
    result(1, 'EVE', '234'), result(2, 'MID', '122', '9'), result(2, 'EVE', '007', '0')
  ]);
  assert.equal(JSON.stringify(source), snapshot, 'normalization does not mutate the input');
});

test('actual calendar dates are validated, including leap years and century boundaries', () => {
  for (const date of ['2024-02-29', '2000-02-29', '2026-04-30', '2026-12-31', '0099-01-01']) {
    assert.equal(normalizeResults([{ ...result(1, 'MID', '007'), date }], { strict: true }).length, 1);
  }
  for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '0000-01-01', '2026-9-01', '09/01/2026', null]) {
    assert.throws(() => normalizeResults([{ ...result(1, 'MID', '007'), date }], { strict: true }));
  }
});

test('invalid records and other games are skipped normally and rejected during strict validation', () => {
  const invalid = [
    null, 7, [], {}, { ...result(1, 'MID', '007'), game: 'P4' },
    { ...result(1, 'MID', '007'), game: null }, result(1, 'mid', '007'),
    result(1, 'MID', 7), result(1, 'MID', '07'), result(1, 'MID', '0007'),
    result(1, 'MID', '0a7'), result(1, 'MID', '007', 0), result(1, 'MID', '007', '10'),
    result(1, 'MID', '007', null),
    { game: 'P3', date: '2026-09-01', draw: 'MID', digits: '007', fireball: '' },
    { game: 'P4', date: '2026-09-01', draw: 'MID', digits: '0-0-0-7', fireball: '' }
  ];
  assert.deepEqual(normalizeResults(invalid), []);
  for (const row of invalid) assert.throws(() => normalizeResults([row], { strict: true }), /row 1/);
  for (const input of [null, undefined, {}, '[]', 7]) {
    assert.deepEqual(normalizeResults(input), []);
    assert.throws(() => normalizeResults(input, { strict: true }), /array/);
  }
});

test('manual results override the same feed draw while keeping every other actual result', () => {
  const base = [result(2, 'EVE', '123'), result(1, 'MID', '007'), result(2, 'MID', '456')];
  const manual = [result(2, 'EVE', '789', '3'), result(3, 'MID', '234')];
  assert.deepEqual(mergeResults(base, manual), [
    result(1, 'MID', '007'), result(2, 'MID', '456'), result(2, 'EVE', '789', '3'), result(3, 'MID', '234')
  ]);
  assert.deepEqual(mergeResults(null, manual), normalizeResults(manual));
});

test('each supported cooldown includes exactly the last N draws and re-allows the preceding result', () => {
  for (const draws of DRAW_OPTIONS) {
    const history = sequence(draws + 1).reverse();
    const before = cooldown(history.filter(row => row.combo !== String(draws).padStart(3, '0')), 'both', { draws });
    assert.equal(before.excluded.has('000'), true);
    const after = cooldown(history, 'both', { draws });
    assert.equal(after.availableCount, draws + 1);
    assert.equal(after.window.length, draws);
    assert.equal(after.excluded.size, draws);
    assert.equal(after.excluded.has('000'), false, 'expired winner returns at length ' + draws);
    for (let i = 1; i <= draws; i++) assert.equal(after.excluded.has(String(i).padStart(3, '0')), true);
  }
});

test('short or empty histories use only available real draws, for every cooldown length', () => {
  for (const draws of DRAW_OPTIONS) {
    const history = sequence(Math.max(0, draws - 1));
    const selected = cooldown(history, 'both', { draws });
    assert.equal(selected.window.length, history.length);
    assert.equal(selected.excluded.size, history.length);
    assert.deepEqual(cooldown([], 'both', { draws }).window, []);
  }
});

test('repeated winners consume draw slots and stay excluded until their most recent occurrence expires', () => {
  const history = [result(1, 'MID', '007'), result(1, 'EVE', '007'), result(2, 'MID', '123'), result(2, 'EVE', '456')];
  let selected = cooldown(history, 'both', { draws: 3 });
  assert.deepEqual(selected.window.map(row => row.combo), ['007', '123', '456']);
  assert.equal(selected.excluded.has('007'), true);
  selected = cooldown([...history, result(3, 'MID', '789')], 'both', { draws: 3 });
  assert.equal(selected.excluded.has('007'), false);
  assert.equal(cooldown(history.slice(0, 3), 'both', { draws: 3 }).excluded.size, 2);
});

test('Midday and Evening count their own sessions; Combined and ALL scope count interleaved draws', () => {
  const history = [result(2, 'EVE', '456'), result(1, 'MID', '007'), result(2, 'MID', '123'), result(1, 'EVE', '890')];
  for (const [tab, combo] of [['mid', '123'], ['eve', '456'], ['both', '456']]) {
    const selected = cooldown(history, tab, { draws: 1 });
    assert.deepEqual([...selected.excluded], [combo]);
    assert.equal(selected.availableCount, tab === 'both' ? 4 : 2);
  }
  assert.deepEqual(cooldown(history, 'both', { draws: 3 }).window.map(row => row.combo), ['890', '123', '456']);
  for (const tab of ['mid', 'eve', 'both']) {
    const selected = cooldown(history, tab, { draws: 3, allDraws: true });
    assert.deepEqual(selected.window.map(row => row.combo), ['890', '123', '456']);
    assert.equal(selected.availableCount, 4);
  }
});

test('cooldown excludes exact straight combos only, without box or Fireball expansion', () => {
  const selected = cooldown([result(1, 'MID', '123', '4')], 'mid', { draws: 7 });
  assert.deepEqual([...selected.excluded], ['123']);
  for (const combo of ['132', '213', '231', '312', '321', '423', '143', '124']) {
    assert.equal(selected.excluded.has(combo), false);
  }
});

test('OFF produces an empty exclusion set while retaining the selected chronological window', () => {
  const selected = cooldown(sequence(10), 'both', { enabled: false, draws: 3 });
  assert.equal(selected.enabled, false);
  assert.equal(selected.excluded.size, 0);
  assert.equal(selected.availableCount, 10);
  assert.deepEqual(selected.window.map(row => row.combo), ['007', '008', '009']);
});
