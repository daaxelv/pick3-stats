// Automated tests for odds.js
// Run with: node odds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import OddsCalculator from './odds.js';

const { classifyCombo, waysForCombo, straightOdds, boxOdds, multiComboCoverage } = OddsCalculator;

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
