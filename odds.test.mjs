// Automated tests for odds.js
// Run with: node odds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import OddsCalculator from './odds.js';

const {
  classifyCombo, waysForCombo, straightOdds, boxOdds, multiComboCoverage,
  classifyCombo4, waysForCombo4, straightOddsP4, boxOddsP4, multiComboCoverageP4,
} = OddsCalculator;

test('classifyCombo identifies unique/double/triple combos', () => {
  assert.equal(classifyCombo('123'), 'unique');
  assert.equal(classifyCombo('112'), 'double');
  assert.equal(classifyCombo('111'), 'triple');
});

test('waysForCombo returns 6/3/1 permutations', () => {
  assert.equal(waysForCombo('123'), 6);
  assert.equal(waysForCombo('112'), 3);
  assert.equal(waysForCombo('111'), 1);
});

test('straight odds are always 1 in 1,000, regardless of combo structure', () => {
  for (const combo of ['123', '112', '111']) {
    const odds = straightOdds(combo);
    assert.equal(odds.numerator, 1);
    assert.equal(odds.denominator, 1000);
    assert.equal(odds.probability, 0.001);
    assert.equal(odds.oneIn, 1000);
  }
});

test('6-way box odds (3 unique digits) are 1 in 166.67', () => {
  const odds = boxOdds('123');
  assert.equal(odds.numerator, 6);
  assert.equal(odds.probability, 0.006);
  assert.equal(odds.oneIn, 166.67);
});

test('3-way box odds (one repeated digit / double) are 1 in 333.33', () => {
  const odds = boxOdds('112');
  assert.equal(odds.numerator, 3);
  assert.equal(odds.probability, 0.003);
  assert.equal(odds.oneIn, 333.33);
});

test('triples have no box option — straight is the only play', () => {
  assert.equal(boxOdds('777'), null);
});

test('multiComboCoverage: 10 combos give a 10-in-1,000 exact-match chance', () => {
  const coverage = multiComboCoverage(10, 1);
  assert.equal(coverage.numCombos, 10);
  assert.equal(coverage.totalCost, 10);
  assert.equal(coverage.exactMatchProbability, 0.01);
  assert.equal(coverage.exactMatchOneIn, 100);
  assert.equal(coverage.exactMatchPercent, 1);
});

test('multiComboCoverage scales cost by cost-per-combo (e.g. straight+fireball at $2)', () => {
  const coverage = multiComboCoverage(5, 2);
  assert.equal(coverage.totalCost, 10);
  assert.equal(coverage.exactMatchProbability, 0.005);
});

test('multiComboCoverage rejects out-of-range combo counts', () => {
  assert.throws(() => multiComboCoverage(0));
  assert.throws(() => multiComboCoverage(1001));
  assert.throws(() => multiComboCoverage(1.5));
});

test('classifyCombo rejects malformed input', () => {
  assert.throws(() => classifyCombo('12'));
  assert.throws(() => classifyCombo('abc'));
});

// --- PICK 4 ---

test('classifyCombo4 identifies unique/oneDouble/twoPair/triple/quad combos', () => {
  assert.equal(classifyCombo4('1234'), 'unique');
  assert.equal(classifyCombo4('1123'), 'oneDouble');
  assert.equal(classifyCombo4('1122'), 'twoPair');
  assert.equal(classifyCombo4('1112'), 'triple');
  assert.equal(classifyCombo4('1111'), 'quad');
});

test('waysForCombo4 returns 24/12/6/4/1 permutations', () => {
  assert.equal(waysForCombo4('1234'), 24);
  assert.equal(waysForCombo4('1123'), 12);
  assert.equal(waysForCombo4('1122'), 6);
  assert.equal(waysForCombo4('1112'), 4);
  assert.equal(waysForCombo4('1111'), 1);
});

test('Pick 4 straight odds are always 1 in 10,000', () => {
  for (const combo of ['1234', '1123', '1122', '1112', '1111']) {
    const odds = straightOddsP4(combo);
    assert.equal(odds.numerator, 1);
    assert.equal(odds.denominator, 10000);
    assert.equal(odds.probability, 0.0001);
    assert.equal(odds.oneIn, 10000);
  }
});

test('24-way Pick 4 box odds (4 unique digits) are 1 in 416.67', () => {
  const odds = boxOddsP4('1234');
  assert.equal(odds.numerator, 24);
  assert.equal(odds.oneIn, 416.67);
});

test('12-way Pick 4 box odds (one pair) are 1 in 833.33', () => {
  const odds = boxOddsP4('1123');
  assert.equal(odds.numerator, 12);
  assert.equal(odds.oneIn, 833.33);
});

test('6-way Pick 4 box odds (two pairs) are 1 in 1,666.67', () => {
  const odds = boxOddsP4('1122');
  assert.equal(odds.numerator, 6);
  assert.equal(odds.oneIn, 1666.67);
});

test('4-way Pick 4 box odds (three of a kind) are 1 in 2,500', () => {
  const odds = boxOddsP4('1112');
  assert.equal(odds.numerator, 4);
  assert.equal(odds.oneIn, 2500);
});

test('Pick 4 quads have no box option — straight is the only play', () => {
  assert.equal(boxOddsP4('1111'), null);
});

test('multiComboCoverageP4: 10 combos give a 10-in-10,000 exact-match chance', () => {
  const coverage = multiComboCoverageP4(10, 1);
  assert.equal(coverage.numCombos, 10);
  assert.equal(coverage.totalCost, 10);
  assert.equal(coverage.exactMatchProbability, 0.001);
  assert.equal(coverage.exactMatchOneIn, 1000);
});

test('multiComboCoverageP4 rejects out-of-range combo counts', () => {
  assert.throws(() => multiComboCoverageP4(0));
  assert.throws(() => multiComboCoverageP4(10001));
  assert.throws(() => multiComboCoverageP4(2.5));
});

test('classifyCombo4 rejects malformed input', () => {
  assert.throws(() => classifyCombo4('123'));
  assert.throws(() => classifyCombo4('abcd'));
});
