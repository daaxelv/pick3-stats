import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./m4l-full-odds-worker.js', import.meta.url), 'utf8');

test('exact worker counts all prize tiers and keeps the 04 filter without storing every ticket', () => {
  const messages = [], tasks = [];
  let call = 0;
  const context = vm.createContext({
    self: {postMessage: message => messages.push(message)},
    setTimeout: fn => tasks.push(fn),
    // Six calls per ticket: quick-pick flag, five unique balls, then MB.
    Math: Object.assign(Object.create(Math), {random: () => [0,0,.02,.04,.06,.08,.65][call++ % 7]}),
  });
  vm.runInContext(source, context);
  context.self.onmessage({data: {type:'start', total:1000, cum:Array.from({length:58},(_,i)=>i+1),
    totW:58, draw:[1,2,3,4,5], drawMB:1}});
  while (tasks.length) tasks.shift()();
  const done = messages.find(message => message.type === 'done');
  assert.ok(done);
  assert.equal(done.tiers.reduce((a,b)=>a+b,0),1000);
  assert.equal(done.tiers[1],1000);
  assert.equal(done.secondMB[4],1000);
  assert.deepEqual([...done.draw],[1,2,3,4,5]);
  context.self.onmessage({data:{type:'focusPage',page:0,size:50}});
  const focus = messages.find(message => message.type === 'focusResult');
  assert.equal(focus.total,1);
  assert.equal(focus.rows[0].key,'1,2,3,4,5,4');
  assert.equal(focus.rows[0].count,1000);
});

test('exact worker records jackpot and second prize by Millionaire Ball', () => {
  const messages = [], tasks = [];
  let value = 0;
  const context = vm.createContext({
    self: {postMessage: message => messages.push(message)},
    setTimeout: fn => tasks.push(fn),
    Math: Object.assign(Object.create(Math), {random: () => { value = (value + 0.001) % 1; return value; }}),
  });
  vm.runInContext(source, context);
  context.self.onmessage({data:{type:'start',total:2000,cum:Array.from({length:58},(_,i)=>i+1),
    totW:58,draw:[1,2,3,4,5],drawMB:4}});
  while (tasks.length) tasks.shift()();
  const done = messages.find(message => message.type === 'done');
  assert.equal(done.tiers.length,9);
  assert.equal(done.tiers[1],done.secondMB.reduce((a,b)=>a+b,0));
  assert.equal(done.secondMB[4],0);
  assert.ok(done.tiers.every(n => n >= 0));
});
