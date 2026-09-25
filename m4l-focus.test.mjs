import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./m4l-focus.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const dedupe = rows => {
  context.rows = rows;
  return vm.runInContext('uniqueM4LDraws(rows)', context);
};
const rank = (tickets, rows) => {
  context.tickets = tickets;
  context.rows = rows;
  return vm.runInContext('rankM4LCandidates(tickets, rows)', context);
};

test('M4L counts one result despite draw labels and zero-padding, but keeps later repeats', () => {
  const rows = [
    { date: '2026-07-11', numbers: [4, 13, 14, 30, 39], mb: '4' },
    { date: '2026-07-11', numbers: [4, 13, 14, 30, 39], mb: 4 },
    { date: '2026-08-11', numbers: [4, 13, 14, 30, 39], mb: '4' },
    { date: '2026-08-12', numbers: [1, 2, 3, 4, 58], mb: '4' },
  ];
  assert.equal(dedupe(rows).length, 3);
  const result = rank([{ numbers: [4, 13, 14, 30, 39], list: '351' }], rows);
  assert.equal(result.matching.length, 3);
  assert.equal(result.focusCounts[13], 2);
  assert.equal(result.allCounts[13], 2);
  assert.equal(result.ranked[0].focusScore, 8);
  assert.equal(result.ranked[0].repeated, true);
});

test('the live M4L feed duplicate is not shown twice in the results log', () => {
  const csv = readFileSync(new URL('./data/nj_numbers_canonical.csv', import.meta.url), 'utf8');
  const rows = csv.trim().split(/\r?\n/).slice(1)
    .map(line => line.split(','))
    .filter(([game, date]) => game === 'M4L' && date === '2026-07-11')
    .map(([, date, , digits, mb]) => ({ date, numbers: digits.split('-').map(Number), mb }));
  assert.equal(rows.length, 2);
  assert.equal(dedupe(rows).length, 1);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /const m4lRows = uniqueM4LDraws\(rows/);
});
