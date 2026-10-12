/** NJ Lottery public draw-range backfill; only complete validated batches are saved. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ranges,unsearchedGaps,requestMatchesRange} from '../collector-plan.mjs';
const dir=path.resolve('cashpop/data');
const args=process.argv.slice(2), i=args.indexOf('--max-batches');
const budget=i>=0?Number(args[i+1]):100;
if(!Number.isInteger(budget)||budget<1||budget>200)throw new Error('Batch budget must be 1–200');
const coverage=JSON.parse(await fs.readFile(path.join(dir,'coverage.json'),'utf8'));
const searches=JSON.parse(await fs.readFile(path.join(dir,'searched-ranges.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '[]';throw error;}));
const pending=unsearchedGaps(coverage.gaps,searches);
if(args.includes('--plan')){console.log(JSON.stringify(ranges(pending,budget)));process.exit(0);}
const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
let completed=0;
try{
  const page=await browser.newPage();await page.goto('https://www.njlottery.com/en-us/drawgames/cashpop.html',{waitUntil:'domcontentloaded',timeout:60000});
  const text=await page.locator('tr[data-toggle="tableWinningNumbers"] strong').first().textContent({timeout:30000});
  const latest=Number(text?.match(/\d+/)?.[0]);if(!Number.isSafeInteger(latest)||latest<coverage.last_draw)throw new Error('Official latest draw is missing or regressed');
  const tail=latest>coverage.last_draw?ranges([{from_draw:coverage.last_draw+1,to_draw:latest}],Math.min(2,budget)):[];
  // A bounded recent tail cannot starve the historical archive of its entire budget.
  const windows=[...tail,...ranges(pending,budget-tail.length)];
  await page.getByRole('radio',{name:'Draw Range',exact:true}).check();
  for(const [first,last] of windows){
    await page.getByRole('textbox',{name:'from',exact:true}).fill(String(first));await page.getByRole('textbox',{name:'to',exact:true}).fill(String(last));
    const [response]=await Promise.all([page.waitForResponse(r=>requestMatchesRange(r.request(),first,last),{timeout:30000}),page.getByRole('tabpanel').getByRole('button',{name:'SEARCH NOW',exact:true}).click()]);
    if(!response.ok())throw new Error(`Official results request failed: HTTP ${response.status()}`);
    await response.finished();
    // Let the official AJAX renderer replace the previous table, including its empty state.
    await page.waitForTimeout(1000);
    await page.waitForFunction(([a,b])=>{const rows=[...document.querySelectorAll('tr[data-toggle="tableWinningNumbers"]')];const n=r=>Number(r?.querySelector('strong')?.textContent.match(/\d+/)?.[0]);const empty=document.querySelector('.winningNumbers-noResults');return (rows.length>0&&rows.every(r=>n(r)>=a&&n(r)<=b)) || (rows.length===0&&empty&&empty.getClientRects().length>0);},[first,last],{timeout:30000});
    const rows=await page.locator('tr[data-toggle="tableWinningNumbers"]').evaluateAll(items=>items.map(tr=>{const c=tr.querySelectorAll('td');return {draw_no:Number(c[0].querySelector('strong')?.textContent.match(/\d+/)?.[0]),date_time:c[0].querySelector('time')?.textContent.trim(),number:Number(c[1].textContent.trim()),total_winners:Number(c[2].textContent.replace(/,/g,'').trim()),total_payout:Number(c[3].textContent.replace(/[^\d.]/g,''))};}));
    if(rows.length>last-first+1||rows.some((r,j)=>r.draw_no<first||r.draw_no>last||(j>0&&r.draw_no>=rows[j-1].draw_no)||!Number.isInteger(r.number)||r.number<1||r.number>15||!r.date_time||!Number.isInteger(r.total_winners)||r.total_winners<0||!Number.isFinite(r.total_payout)||r.total_payout<0))throw new Error(`Invalid batch ${first}–${last}`);
    const filename=path.join(dir,`official-sample-${first}-${last}.json`);await fs.writeFile(filename+'.tmp',JSON.stringify(rows));await fs.rename(filename+'.tmp',filename);
    searches.push({from_draw:first,to_draw:last,returned:rows.length,checked_at:new Date().toISOString()});const log=path.join(dir,'searched-ranges.json');await fs.writeFile(log+'.tmp',JSON.stringify(searches));await fs.rename(log+'.tmp',log);completed++;console.log(`Verified ${first}–${last}: ${rows.length} results; ${last-first+1-rows.length} unavailable IDs`);
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}finally{
  await browser.close();if(completed){const result=spawnSync('python3',['cashpop/scripts/build_history.py'],{stdio:'inherit'});if(result.status!==0)throw new Error('Archive validation failed');}
}
