import test from 'node:test';import assert from 'node:assert/strict';
import {frequencies,sortRows,playCost,validateRows} from './model.mjs';
const rows=[{draw_no:1,number:7,date_time:'2019-09-30T05:15'},{draw_no:2,number:4,date_time:'2019-09-30T05:30'},{draw_no:3,number:7,date_time:'2019-09-30T05:45'}];
test('all fifteen numbers, correct counts and latest date regardless of input order',()=>{const f=frequencies([...rows].reverse());assert.equal(f.length,15);assert.equal(f[6].hits,2);assert.equal(f[6].last_draw,3);assert.equal(f[6].share,2/3);assert.equal(f.reduce((s,r)=>s+r.hits,0),3);});
test('sort keeps rank, number, hits and date attached; no mutation',()=>{const f=frequencies(rows);const before=structuredClone(f);const asc=sortRows(f,'hits','asc');assert.equal(asc.at(-1).number,7);assert.equal(asc.at(-1).rank,1);assert.equal(asc.at(-1).last_draw,3);assert.deepEqual(f,before);assert.equal(sortRows(f,'hits','desc')[0].number,7);});
test('ties use number order; unseen dates stay last',()=>{const f=frequencies(rows);assert.equal(sortRows(f,'hits','asc')[0].number,1);assert.equal(sortRows(f,'last_draw','asc')[0].number,4);});
test('empty archive is honest',()=>assert.ok(frequencies([]).every(r=>r.hits===0&&r.share===0&&r.last_date===null)));
test('reject duplicate and invalid draws',()=>{assert.throws(()=>validateRows([...rows,rows[0]]));assert.throws(()=>validateRows([{...rows[0],number:16}]));assert.throws(()=>sortRows([], 'bad'));});
test('actual CASH POP odds and ticket cost, not M4L odds',()=>{assert.deepEqual(playCost(1,1,1),{cost:1,matchChance:1/15});assert.deepEqual(playCost(15,20,20),{cost:6000,matchChance:1});assert.throws(()=>playCost(16,1,1));assert.throws(()=>playCost(1,3,1));});
