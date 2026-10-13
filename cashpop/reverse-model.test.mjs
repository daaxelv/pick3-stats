import test from 'node:test';import assert from 'node:assert/strict';
import {reverseRanking,drawingAt} from './reverse-model.mjs';
test('reverse ranks all fifteen numbers with cohort exposure and filters',()=>{
 const b=(day,h,m,counts)=>({year:2026,era:'4min',weekday:day,hour:h,minute:m,counts:[...counts,...Array(15-counts.length).fill(0)]});
 const data={bins:[b(0,14,2,[2,4]),b(1,14,2,[8,1]),b(0,14,6,[3,2])]};
 let r=reverseRanking(data,{target:842});assert.equal(r.draws,15);assert.equal(r.rows[0].number,1);assert.equal(r.rows.length,15);
 r=reverseRanking(data,{target:842,weekday:'0'});assert.equal(r.rows[0].number,2);assert.equal(r.rows[0].share,4/6);
 assert.equal(reverseRanking(data,{target:842,radius:4}).draws,20);
 assert.equal(reverseRanking(data,{target:840}).rows[0].share,null);
});
test('date lookup preserves exact Eastern date and reports unavailable times honestly',()=>{
 const rows=[{date_time:'2026-10-12T14:02',number:2},{date_time:'2026-10-11T14:02',number:4}];
 assert.equal(drawingAt(rows,'2026-10-12','14:02')[0].number,2);
 assert.deepEqual(drawingAt(rows,'2026-10-12','14:00'),[]);
});
