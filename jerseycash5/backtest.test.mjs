import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planBacktest,runBacktest,baselineTickets,evaluateTickets,MODELS} from './backtest.mjs';
import {key} from './model.mjs';
const archive=JSON.parse(fs.readFileSync(new URL('./data/history.json',import.meta.url)));

test('monthly training precedes every actual outcome; promotions are excluded',()=>{
  const plan=planBacktest(archive.draws,'365');assert.equal(plan.reduce((s,p)=>s+p.draws.length,0),365);
  for(const p of plan){assert.ok(p.training.length>=180);assert.ok(p.training.every(r=>r.date<p.month+'-01'&&r.draw_type==='regular'));assert.ok(p.draws.every(r=>r.date>p.training.at(-1).date&&r.draw_type==='regular'));}
  assert.throws(()=>planBacktest(archive.draws,'invalid'),/window/);
  const regular=archive.draws.filter(r=>r.draw_type==='regular');assert.throws(()=>planBacktest([...regular,regular[0]]),/Duplicate/);
  assert.throws(()=>planBacktest(regular.slice(0,180)),/Not enough/);
});
test('baseline selects ten distinct valid sets, deterministic by seed/month/trial',()=>{
  const t=baselineTickets(2026,'2026-10',0);assert.deepEqual(t,baselineTickets(2026,'2026-10',0));assert.equal(new Set(t.map(key)).size,10);
  for(const x of t){assert.equal(new Set(x.nums).size,5);assert.ok(x.nums.every(n=>n>=1&&n<=45));}
  assert.notDeepEqual(t,baselineTickets(2026,'2026-10',1));assert.notDeepEqual(t,baselineTickets(2026,'2026-09',0));assert.notDeepEqual(t,baselineTickets(2027,'2026-10',0));
});
test('match evaluation counts every ticket-draw outcome and preserves actual Bullseye',()=>{
  const tickets=[{nums:[1,2,3,4,5]},{nums:[1,2,3,4,6]},{nums:[1,2,3,7,8]},{nums:[1,2,9,10,11]}],d={date:'2026-01-01',nums:[1,2,3,4,5],bullseye:5};
  const r=evaluateTickets(tickets,[d,{...d,date:'2026-01-02',bullseye:null}]);assert.deepEqual(r.counts,[0,0,2,2,2,2]);assert.equal(r.details.length,6);assert.equal(r.details[0].includesBullseye,true);assert.equal(r.details[1].includesBullseye,false);assert.equal(r.details[3].includesBullseye,null);assert.equal(r.details[0].winning,'1-2-3-4-5');
});
test('changing held-out outcomes cannot change any model selection in that month',()=>{
  const last=archive.last_date.slice(0,7),input=archive.draws.filter(r=>r.date<last+'-02');
  const original=runBacktest(input,{window:'90',seed:42});
  const altered=runBacktest(input.map(r=>r.date.startsWith(last)?{...r,nums:[1,2,3,4,5],bullseye:1,jackpot_payout:10000000}:r),{window:'90',seed:42});
  assert.deepEqual(original.selections,altered.selections);assert.equal(original.summary.length,MODELS.length+1);
  for(const r of original.summary){assert.equal(r.draws,90);assert.equal(r.ticketsScored,900);assert.equal(r.counts.reduce((s,n)=>s+n,0),900);assert.equal(r.threePlus,r.counts[3]+r.counts[4]+r.counts[5]);}
  for(const r of original.monthly){assert.ok(r.trainingThrough<r.testFirst);assert.equal(r.ticketsScored,r.draws*10);assert.ok(r.repeatedFromPriorMonth===null||r.repeatedFromPriorMonth<=10);}
  assert.equal(original.baseline.totals.length,20);assert.equal(original.baseline.totals[0],original.summary.find(r=>r.model==='uniform').threePlus);
  assert.throws(()=>runBacktest(input,{seed:NaN}),/Seed/);
});
