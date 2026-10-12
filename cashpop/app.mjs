import {sortRows, playCost} from './model.mjs';
const $ = id => document.getElementById(id);
let snapshot, rows = [], key = 'hits', direction = 'desc';
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
function cell(tr, text, ball=false) { const td=document.createElement('td'); if(ball){const span=document.createElement('span');span.className='ball';span.textContent=text;td.append(span);}else td.textContent=text;tr.append(td); }
function render() {
  if (!snapshot) return;
  const group=snapshot.groups[$('window').value]; rows=sortRows(group.rows,key,direction);
  $('analysis').textContent=`${group.count.toLocaleString()} collected draws · ${group.first_date ?? 'No start date'} to ${group.last_date ?? 'No end date'} (ET). Expected long-run share per number: 6.67%.`;
  const best=sortRows(group.rows,'hits','desc');const tied=best.filter(r=>r.hits===best[0]?.hits);
  $('leaders').textContent=group.count ? `Most frequent in this window: ${tied.map(r=>String(r.number).padStart(2,'0')).join(', ')} — ${best[0].hits.toLocaleString()} hits each (${(best[0].share*100).toFixed(2)}%).` : 'No verified results yet.';
  $('frequencies').replaceChildren();
  for(const r of rows){const tr=document.createElement('tr');cell(tr,r.rank);cell(tr,String(r.number).padStart(2,'0'),true);cell(tr,r.hits.toLocaleString());cell(tr,(r.share*100).toFixed(2)+'%');cell(tr,r.last_date ? `${r.last_date.replace('T',' ')} · #${r.last_draw}` : 'Not seen in this window');$('frequencies').append(tr);}
  for(const b of document.querySelectorAll('[data-sort]')) {b.parentElement.setAttribute('aria-sort',b.dataset.sort===key?(direction==='asc'?'ascending':'descending'):'none');}
}
function sort(k,d){key=k;direction=d;render();}
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>sort(b.dataset.sort,key===b.dataset.sort&&direction==='desc'?'asc':'desc')));
$('most').onclick=()=>sort('hits','desc');$('least').onclick=()=>sort('hits','asc');$('window').onchange=()=>render();
$('export').onclick=()=>{if(!snapshot)return;const csv=['rank,number,hits,share_percent,last_draw,last_date_ET',...rows.map(r=>[r.rank,r.number,r.hits,(r.share*100).toFixed(4),r.last_draw??'',r.last_date??''].join(','))].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`cashpop-frequency-${$('window').value}.csv`;a.click();URL.revokeObjectURL(url);};
function cost(){try{const p=playCost(Number($('numbers').value),Number($('wager').value),Number($('draws').value));$('cost').textContent=`Total ticket cost: ${money(p.cost)} · Match chance per draw: ${(p.matchChance*100).toFixed(2)}%. A match is not necessarily a net profit.`;}catch{$('cost').textContent='Choose 1–15 numbers, a listed wager, and 1–20 draws.';}}
['numbers','wager','draws'].forEach(id=>$(id).addEventListener('input',cost));cost();
async function load(){
  $('refresh').disabled=true;
  try{const response=await fetch('data/summary.json',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(data.schema!==1||!data.groups?.all?.rows||!data.coverage)throw new Error('Invalid archive summary');snapshot=data;
    const c=data.coverage;$('coverage').textContent=`${c.complete?'Complete through collected endpoint':'PARTIAL ARCHIVE — backfill needed'}: ${c.loaded_draws.toLocaleString()} of ${c.last_draw.toLocaleString()} numbered draws (${c.percent.toFixed(2)}%). Missing: ${c.missing_draws.toLocaleString()}.`;
    $('progress').value=c.percent;$('source').textContent=`Source: NJ Lottery official results search. Latest collected: ${data.groups.all.last_date?.replace('T',' ')} ET (#${c.last_draw}). ${response.headers.get('X-Pick3-Cached')?'Offline cached snapshot — may be stale.':''}`;
    const selected=$('window').value;while($('window').options.length>2)$('window').remove(2);for(const year of Object.keys(data.groups).filter(k=>/^\d{4}$/.test(k)).sort().reverse()){$('window').add(new Option(`${year} collected draws`,year));}if(data.groups[selected])$('window').value=selected;render();
    $('recent').replaceChildren();for(const r of data.recent){const tr=document.createElement('tr');cell(tr,r.draw_no);cell(tr,r.date_time.replace('T',' '));cell(tr,String(r.number).padStart(2,'0'),true);cell(tr,r.total_winners.toLocaleString());cell(tr,money(r.total_payout));$('recent').append(tr);}
  }catch(error){$('coverage').textContent=`Could not refresh CASH POP history: ${error.message}. ${snapshot?'Previously loaded snapshot remains displayed.':'No results are being invented.'}`;}finally{$('refresh').disabled=false;}
}
$('refresh').onclick=load;load();
