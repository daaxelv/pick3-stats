#!/usr/bin/env node
// Computes real historical straight-bet payout statistics from
// data/nj_numbers_canonical.csv (read-only) so the app can show honest
// "historical average / range" payout figures instead of fabricated
// fixed numbers. Run this whenever the canonical CSV is refreshed, then
// paste the printed PAYOUT_STATS object into index.html.
//
// Usage: node scripts/build_payout_stats.mjs
//
// NJ Pick 3 is pari-mutuel: the actual straight-bet prize varies draw to
// draw based on the betting pool, so there is no single "correct" payout
// number. This script reports the historical average, min, and max of the
// prize_straight column, grouped by combo structure (unique digits /
// double / triple), which is the only prize data present in the canonical
// file. Box ("any order") prizes are not present in the source data — NJ
// Lottery's published rule is that a 6-way box prize is the straight prize
// divided by 6, and a 3-way (double) box prize is the straight prize
// divided by 3; the app surfaces that as a documented ratio, not an
// invented dollar figure. Fireball is a separate add-on bet with its own
// independent payout pool that is not recorded in this dataset, so no
// Fireball dollar amount is fabricated here either.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', 'data', 'nj_numbers_canonical.csv');

function parsePrize(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (s === '') return NaN;
  s = s.replace(/^US\s+/i, ''); // a handful of rows have a stray "US " prefix
  s = s.replace(/\.{2,}/g, '.'); // a handful of rows have a doubled decimal point
  return Number(s);
}

function summarize(arr) {
  if (!arr.length) return null;
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    count: arr.length,
    avg: Math.round((sum / arr.length) * 100) / 100,
    min: Math.min(...arr),
    max: Math.max(...arr),
  };
}

const lines = readFileSync(CSV_PATH, 'utf8').trim().split('\n');
const buckets = { unique: [], double: [], triple: [] };
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(',');
  const digits = parts[3];
  const n = parsePrize(parts[5]);
  if (Number.isNaN(n)) {
    skipped++;
    continue;
  }
  const set = new Set(digits.split('-'));
  const cat = set.size === 3 ? 'unique' : set.size === 2 ? 'double' : 'triple';
  buckets[cat].push(n);
}

const PAYOUT_STATS = {
  source: 'data/nj_numbers_canonical.csv',
  generated_at: new Date().toISOString().slice(0, 10),
  rows_used: lines.length - 1 - skipped,
  rows_skipped_missing_prize: skipped,
  straight: {
    unique: summarize(buckets.unique),
    double: summarize(buckets.double),
    triple: summarize(buckets.triple),
  },
  box_ratio_note: '6-way box (unique digits) pays straight/6; 3-way box (double) pays straight/3, per NJ Lottery rules. Not an independent figure.',
};

console.log('// Paste this into index.html as PAYOUT_STATS:');
console.log('const PAYOUT_STATS = ' + JSON.stringify(PAYOUT_STATS) + ';');
