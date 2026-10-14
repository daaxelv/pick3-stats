import test from 'node:test';import assert from 'node:assert/strict';
import {buildComparison,passesFilters,sortComparison,ranks,csvComparison} from './narrow-model.mjs';
const coverage={last_draw:100,loaded_draws:100,gaps:[],complete:true};
const summary={coverage,groups:{all:{rows:Array.from({length:15},(_,i)=>({number:i+1,last_draw:100-i,last_date:'2026-10-14T09:30'}))}}};
const bin=(year,minute,counts)=>({year,era:'4min',weekday:0,hour:14,minute,counts});
const archive={schema:1,coverage,bins:[bin(2026,2,[10,10,5,...Array(12).fill(0)]),bin(2025,6,[0,0,20,...Array(12).fill(0)])]};
test('shared ranks, gap anchor and weighted normalized score',()=>{
 const a=buildComparison(archive,summary,{target:842,weights:[1,0,1]});
 assert.equal(a.rows[0].frequencyRank,2);assert.equal(a.rows[1].frequencyRank,2);assert.equal(a.rows[2].frequencyRank,1);
 assert.equal(a.rows[0].timeRank,1);assert.equal(a.rows[1].timeRank,1);assert.equal(a.rows[2].timeRank,3);
 assert.ok(Math.abs(a.rows[0].score-(100*13/14+100)/2)<1e-9);
 const b=buildComparison(archive,summary,{year:'2026',target:842});assert.equal(b.rows[2].knownGap,2);assert.equal(b.rows[2].gapRank,a.rows[2].gapRank);
 assert.equal(buildComparison(archive,summary,{gapPreference:'short'}).rows[0].preferredGapRank,1);
});
test('missing time or uncertain gap is unavailable, positive weights renormalize',()=>{
 const a=buildComparison(archive,summary,{target:843,weights:[0,0,1]});assert.ok(a.rows.every(r=>r.timeRank===null&&r.score===null&&r.partial));
 const c={...coverage,gaps:[{from_draw:99,to_draw:99}],loaded_draws:99};
 const b=buildComparison({...archive,coverage:c},{...summary,coverage:c},{target:842});assert.equal(b.rows[2].knownGap,1);assert.equal(b.rows[2].drawSpan,2);assert.equal(b.rows[2].gapRank,null);assert.equal(b.rows[2].partial,true);
 assert.ok(buildComparison(archive,summary,{target:843}).rows.every(r=>r.score!==null&&r.partial));
 assert.ok(buildComparison(archive,summary,{weights:[0,0,0]}).rows.every(r=>r.score===null));
 assert.throws(()=>buildComparison(archive,{...summary,coverage:{...coverage,last_draw:101}}),/snapshots differ/);
});
test('AND/OR filters, unknown exclusion and whole-row reversible sort',()=>{
 const row={frequencyRank:2,gapRank:null,timeRank:7};assert.equal(passesFilters(row,{frequencyMax:3,gapMax:5}),false);assert.equal(passesFilters(row,{frequencyMax:3,gapMax:5,match:'any'}),true);assert.equal(passesFilters(row,{}),true);
 const rows=[{number:3,score:8,lastDate:'A'},{number:1,score:9,lastDate:'B'},{number:2,score:null,lastDate:'C'}];assert.deepEqual(sortComparison(rows).map(r=>r.number),[1,3,2]);assert.deepEqual(sortComparison(rows,'score','asc').map(r=>r.number),[3,1,2]);assert.equal(sortComparison(rows)[0].lastDate,'B');assert.equal(rows[0].number,3);
 assert.deepEqual([...ranks([{number:1,n:7},{number:2,n:7},{number:3,n:2}],'n').values()],[1,1,3]);
 assert.match(csvComparison(rows,{filters:{year:'all'}}),/"filters","\{""year"":""all""\}"/);
});
