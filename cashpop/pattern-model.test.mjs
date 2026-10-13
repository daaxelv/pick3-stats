import test from 'node:test';
import assert from 'node:assert/strict';
import {numberPatterns} from './pattern-model.mjs';
test('number research groups weekdays, uses all-number denominators and wraps nearby times at midnight',()=>{
 const bin=(weekday,hour,minute,n,total)=>({year:2026,era:'4min',weekday,hour,minute,counts:[total-n,n,...Array(13).fill(0)]});
 const data={bins:[bin(0,14,0,3,10),bin(1,14,0,5,20),bin(0,23,58,2,10),bin(1,0,2,4,10)]};
 const p=numberPatterns(data,2,{weekday:'all',radius:4});
 assert.equal(p.times[0].hits,8);assert.equal(p.times[0].draws,30);
 assert.equal(p.weekdays[0].weekday,1);
 assert.equal(p.clusters.find(r=>r.time===1438).hits,6);
 const monday=numberPatterns(data,2,{weekday:'0'});assert.ok(monday.weekdays.every(r=>r.weekday===0));
});
