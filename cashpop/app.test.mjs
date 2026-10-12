import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sortRows,playCost,frequencies} from './model.mjs';
const snapshot=JSON.parse(fs.readFileSync(new URL('./data/summary.json',import.meta.url),'utf8'));
class Element {
  constructor(){this.children=[];this.textContent='';this.value='';this.options=[];this.events={};this.attrs={};}
  append(e){this.children.push(e);} replaceChildren(){this.children=[];}
  add(e){this.options.push(e);} remove(i){this.options.splice(i,1);}
  addEventListener(event,fn){this.events[event]=fn;}setAttribute(k,v){this.attrs[k]=v;}
}
async function setup(){
  const elements=Object.fromEntries(['window','analysis','leaders','frequencies','most','least','export','numbers','wager','draws','cost','refresh','coverage','progress','source','recent'].map(id=>[id,new Element()]));
  elements.window.value='all';elements.window.options=[{},{}];
  for(const id of ['numbers','wager','draws'])elements[id].value='1';
  const headings=['rank','number','hits','share','last_draw'].map(key=>{const e=new Element();e.dataset={sort:key};e.parentElement=new Element();return e;});
  let fail=false;
  const context=vm.createContext({sortRows,playCost,document:{getElementById:id=>elements[id],createElement:()=>new Element(),querySelectorAll:()=>headings},Option:class{constructor(text,value){this.text=text;this.value=value;}},fetch:async()=>({ok:!fail,status:503,json:async()=>structuredClone(snapshot),headers:{get:()=>null}}),Blob,URL,Intl,console});
  const source=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8').replace(/^import .*\n/,'');
  vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  return {elements,headings,fail:()=>{fail=true;}};
}
test('saved summary counts match every archived year',()=>{
  for(const year of Object.keys(snapshot.groups).filter(k=>/^\d{4}$/.test(k))){const draws=JSON.parse(fs.readFileSync(new URL(`./data/history-${year}.json`,import.meta.url),'utf8'));assert.deepEqual(frequencies(draws),snapshot.groups[year].rows);}
  assert.equal(snapshot.groups.all.rows.reduce((n,r)=>n+r.hits,0),snapshot.coverage.loaded_draws);
});
test('page loads fifteen rows, reverses whole-row sorting, and retains rank/date',async()=>{
  const {elements:e,headings}=await setup();assert.equal(e.frequencies.children.length,15);assert.ok(e.coverage.textContent.includes(snapshot.coverage.loaded_draws.toLocaleString()));
  e.least.onclick();const last=e.frequencies.children.at(-1).children;const number=Number(last[1].children[0].textContent);const expected=snapshot.groups.all.rows.find(r=>r.number===number);assert.equal(Number(last[0].textContent),expected.rank);assert.equal(last[4].textContent,`${expected.last_date.replace('T',' ')} · #${expected.last_draw}`);
  e.most.onclick();assert.equal(headings.find(h=>h.dataset.sort==='hits').parentElement.attrs['aria-sort'],'descending');
  const hit=headings.find(h=>h.dataset.sort==='hits');hit.events.click();assert.equal(hit.parentElement.attrs['aria-sort'],'ascending');
});
test('year filtering, calculator and failed refresh preserve verified table',async()=>{
  const {elements:e,fail}=await setup();e.window.value='2019';e.window.onchange();assert.ok(e.analysis.textContent.includes(`${snapshot.groups['2019'].count.toLocaleString()} collected draws`));
  e.numbers.value='15';e.wager.value='20';e.draws.value='20';e.numbers.events.input();assert.match(e.cost.textContent,/6,000/);assert.match(e.cost.textContent,/100.00%/);
  const table=e.frequencies.children;fail();await e.refresh.onclick();assert.equal(e.frequencies.children,table);assert.match(e.coverage.textContent,/Previously loaded snapshot remains displayed/);
});
