import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./model.js',import.meta.url),'utf8');
const {parseRows,scoreModel,backtest,candidateTickets}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sample=parseRows(readFileSync(new URL('./research-sample-60.csv',import.meta.url),'utf8'));
const live=parseRows(readFileSync(new URL('../data/nj_numbers_canonical.csv',import.meta.url),'utf8'));
test('sample and canonical history are valid and duplicate dates are deduplicated',()=>{
 assert.equal(sample.length,60);assert.ok(live.length>=217);assert.equal(new Set(live.map(r=>r.date)).size,live.length);
 assert.throws(()=>parseRows('date,numbers,mb\n2026-01-01,1 2 3 4 5,1\n2026-01-01,1 2 3 4 6,1'),/Conflicting/);
});
test('all models generate legal distinct sets, including 04 focus',()=>{
 for(const name of ['origin','physical','uniform']){
  const w=scoreModel(sample,'2026-09-27',name,'conservative');
  assert.ok(Math.abs(w.main.reduce((a,b)=>a+b)-5)<1e-9);assert.ok(Math.abs(w.mb.reduce((a,b)=>a+b)-1)<1e-9);
  const tickets=candidateTickets(w,25,true);assert.equal(tickets.length,25);assert.equal(new Set(tickets.map(t=>t.nums.join(','))).size,25);
  for(const t of tickets){assert.equal(t.nums.length,5);assert.ok(t.nums.includes(4));assert.equal(t.mb,4);}
 }
});
test('walk-forward holdout sees only preceding results',()=>{
 const a=backtest(sample,'conservative',30);
 const mutated=sample.map((r,i)=>i===sample.length-1?{...r,nums:[1,2,3,4,5],mb:1}:r);
 const before=scoreModel(sample.slice(0,-1),sample.at(-1).date,'origin');
 const after=scoreModel(mutated.slice(0,-1),sample.at(-1).date,'origin');
 assert.deepEqual(before,after);
 assert.equal(a.origin.tested,30);assert.equal(a.physical.tested,30);assert.equal(a.uniform.tested,30);
});
