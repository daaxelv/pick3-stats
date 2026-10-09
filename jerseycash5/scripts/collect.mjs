import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {normalize,snapshot,SOURCE,nextDate} from '../data.mjs';
const path='jerseycash5/data/history.json',previous=JSON.parse(await fs.readFile(path,'utf8'));
const browser=await chromium.launch({headless:true});let raw;
try{const page=await browser.newPage();await page.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('td[title="date"]').first().waitFor({timeout:30000});
raw=await page.locator('tr[data-toggle="tableWinningNumbers"]').evaluateAll(rs=>rs.filter(r=>r.querySelector('td[title="date"]')).map(r=>{
  const payout=r.querySelector('td[title="5/5 Payout"]')?.textContent.replace(/[^\d.]/g,'');
  return {date:r.querySelector('td[title="date"]').textContent.trim(),nums:[...r.querySelectorAll('td[title="Winning numbers"] i')].map(n=>Number(n.textContent)),bullseye:Number(r.querySelector('i.cash5')?.textContent)||null,xtra:Number(r.querySelector('td[title="xtra"]')?.textContent.match(/\d+/)?.[0])||null,jackpot_payout:payout?Number(payout):null};
}));}finally{await browser.close();}
const fresh=normalize(raw),known=new Map(previous.draws.map(r=>[r.date+'|'+r.draw_type,r]));
for(const r of fresh){const id=r.date+'|'+r.draw_type;if(known.has(id)&&JSON.stringify(known.get(id))!==JSON.stringify(r))throw Error('Official source conflicts with saved history: '+id);known.set(id,r);}
const rows=[...known.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.draw_type.localeCompare(b.draw_type)),data=snapshot(rows);
if(data.first_date!==previous.first_date||data.missing_dates.length)throw Error('Refusing incomplete archive');
const today=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'})),yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);let expected=`${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
if(expected.slice(5)==='12-25')expected=expected.slice(0,8)+'24';
if(data.last_date<expected)throw Error('Official results have not yet published '+expected);
await fs.writeFile(path+'.tmp',JSON.stringify(data)+'\n');await fs.rename(path+'.tmp',path);console.log(`Verified ${data.regular_draws} regular draws through ${data.last_date}, ${data.promotional_draws} promotions, ${data.jackpot_paid_draws} jackpot-paid draws.`);
