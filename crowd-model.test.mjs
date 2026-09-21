import {test} from 'node:test';
import assert from 'node:assert/strict';
import Crowd from './crowd-model.js';
import Feed from './feed-status.js';

test('weighted crowd samples exactly N independent choices, preserves zero weights and reproduces seeds',()=>{
  const counts=Crowd.sample([0,1,3],100000,123);
  assert.equal(counts.reduce((a,b)=>a+b),100000);
  assert.equal(counts[0],0);
  assert.ok(counts.every(Number.isInteger));
  assert.ok(Math.abs(counts[1]-25000)<700);
  assert.deepEqual(counts,Crowd.sample([0,1,3],100000,123));
  assert.notDeepEqual(counts,Crowd.sample([0,1,3],100000,124));
});
test('one-person and million-person crowds conserve population',()=>{
  const weights=Array.from({length:1000},(_,i)=>i+1);
  for(const n of [1,100,1000,1000000]) assert.equal(Crowd.sample(weights,n,42).reduce((a,b)=>a+b),n);
});
test('stable estimates stay fixed and invalid crowd sizes cannot corrupt rankings',()=>{
  assert.deepEqual(Crowd.expected([1,1,1],10),[4,3,3]);
  assert.equal(Crowd.size(NaN),100000);
  assert.equal(Crowd.size(-5),1);
  assert.equal(Crowd.size(10000001),1000000);
  assert.equal(Crowd.size(2.8),3);
  assert.throws(()=>Crowd.sample([0,0],10));
});
test('draw cutoffs use New Jersey time in both DST seasons regardless of device timezone',()=>{
  assert.deepEqual(Feed.cutoffs(new Date('2026-09-21T16:58:00Z')),{MID:'2026-09-20',EVE:'2026-09-20'});
  assert.deepEqual(Feed.cutoffs(new Date('2026-09-21T16:59:00Z')),{MID:'2026-09-21',EVE:'2026-09-20'});
  assert.deepEqual(Feed.cutoffs(new Date('2026-01-10T17:59:00Z')),{MID:'2026-01-10',EVE:'2026-01-09'});
  assert.deepEqual(Feed.cutoffs(new Date('2026-09-22T02:57:00Z')),{MID:'2026-09-21',EVE:'2026-09-21'});
  assert.deepEqual(Feed.cutoffs(new Date('2026-09-22T03:00:00Z'),20),{MID:'2026-09-21',EVE:'2026-09-20'});
  assert.deepEqual(Feed.cutoffs(new Date('2026-09-22T04:00:00Z')),{MID:'2026-09-21',EVE:'2026-09-21'});
});
test('freshness catches gaps within recent history, not only latest dates',()=>{
  const history=[{date:'2026-09-21',draw:'MID'},{date:'2026-09-20',draw:'EVE'}];
  const result=Feed.missing(history,new Date('2026-09-21T19:00:00Z'),2);
  assert.deepEqual(result.missing,{MID:['2026-09-20'],EVE:['2026-09-19']});
});
test('incomplete downloads cannot replace complete saved history; corrections remain valid',()=>{
  const old=[{date:'2026-09-20',draw:'MID',combo:'123'},{date:'2026-09-20',draw:'EVE',combo:'456'}];
  assert.throws(()=>Feed.assertComplete(old,[old[1]]),/incomplete/);
  assert.throws(()=>Feed.assertComplete(old,[]),/no valid/);
  assert.doesNotThrow(()=>Feed.assertComplete(old,[{...old[0],combo:'321'},old[1]]));
});
