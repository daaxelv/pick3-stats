/** NJ Lottery public draw-range backfill; only complete validated batches are saved. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=path.resolve('cashpop/data');
const args=process.argv.slice(2), i=args.indexOf('--max-batches');
const budget=i>=0?Number(args[i+1]):100;
if(!Number.isInteger(budget)||budget<1||budget>200)throw new Error('Batch budget must be 1–200');
const coverage=JSON.parse(await fs.readFile(path.join(dir,'coverage.json'),'utf8'));
export function ranges(gaps, limit) {const out=[];for(const g of gaps){for(let first=g.from_draw;first<=g.to_draw&&out.length<limit;first+=500)out.push([first,Math.min(first+499,g.to_draw)]);}return out;}
if(args.includes('--plan')){console.log(JSON.stringify(ranges(coverage.gaps,budget)));process.exit(0);}
const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
let completed=0;
try{
  const page=await browser.newPage();await page.goto('https://www.njlottery.com/en-us/drawgames/cashpop.html',{waitUntil:'domcontentloaded',timeout:60000});
  const text=await page.locator('tr[data-toggle="tableWinningNumbers"] strong').first().textContent({timeout:30000});
  const latest=Number(text?.match(/\d+/)?.[0]);if(!Number.isSafeInteger(latest)||latest<coverage.last_draw)throw new Error('Official latest draw is missing or regressed');
  const tail=latest>coverage.last_draw?ranges([{from_draw:coverage.last_draw+1,to_draw:latest}],Math.min(2,budget)):[];
  // A bounded recent tail cannot starve the historical archive of its entire budget.
  const windows=[...tail,...ranges(coverage.gaps,budget-tail.length)];
  await page.getByRole('radio',{name:'Draw Range',exact:true}).check();
  for(const [first,last] of windows){
    await page.getByRole('textbox',{name:'from',exact:true}).fill(String(first));await page.getByRole('textbox',{name:'to',exact:true}).fill(String(last));
    await page.getByRole('tabpanel').getByRole('button',{name:'SEARCH NOW',exact:true}).click();
    await page.waitForFunction(([a,b])=>{const rows=document.querySelectorAll('tr[data-toggle="tableWinningNumbers"]');const n=r=>Number(r?.querySelector('strong')?.textContent.match(/\d+/)?.[0]);return rows.length===b-a+1&&n(rows[0])===b&&n(rows[rows.length-1])===a;},[first,last],{timeout:30000});
    const rows=await page.locator('tr[data-toggle="tableWinningNumbers"]').evaluateAll(items=>items.map(tr=>{const c=tr.querySelectorAll('td');return {draw_no:Number(c[0].querySelector('strong')?.textContent.match(/\d+/)?.[0]),date_time:c[0].querySelector('time')?.textContent.trim(),number:Number(c[1].textContent.trim()),total_winners:Number(c[2].textContent.replace(/,/g,'').trim()),total_payout:Number(c[3].textContent.replace(/[^\d.]/g,''))};}));
    if(rows.length!==last-first+1||rows.some((r,j)=>r.draw_no!==last-j||!Number.isInteger(r.number)||r.number<1||r.number>15||!r.date_time||!Number.isInteger(r.total_winners)||r.total_winners<0||!Number.isFinite(r.total_payout)||r.total_payout<0))throw new Error(`Invalid batch ${first}–${last}`);
    const filename=path.join(dir,`official-sample-${first}-${last}.json`);await fs.writeFile(filename+'.tmp',JSON.stringify(rows));await fs.rename(filename+'.tmp',filename);completed++;console.log(`Verified ${first}–${last}`);
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}finally{
  await browser.close();if(completed){const result=spawnSync('python3',['cashpop/scripts/build_history.py'],{stdio:'inherit'});if(result.status!==0)throw new Error('Archive validation failed');}
}
