export const SOURCE='https://www.njlottery.com/en-us/drawgames/jerseycash.html';
export const FIRST='2020-06-29';
export function nextDate(day){const d=new Date(day+'T12:00:00Z');if(!Number.isFinite(+d))throw Error('Invalid date');do{d.setUTCDate(d.getUTCDate()+1);}while(d.toISOString().slice(5,10)==='12-25');return d.toISOString().slice(0,10);}
export function normalize(raw){
  const found=new Map();let date=null;
  for(const r of raw){
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(r.date)){const [m,d,y]=r.date.split('/');date=`${y}-${m}-${d}`;}
    else if(!/Green Ball Double Draw|Double Draw/i.test(r.date))throw Error('Unknown source row: '+r.date);
    if(!date)throw Error('Promotional row without parent date');
    const drawType=/^\d{2}\//.test(r.date)?'regular':'promotion';
    const nums=r.nums.slice().sort((a,b)=>a-b);
    if(nums.length!==5||new Set(nums).size!==5||nums.some(n=>!Number.isInteger(n)||n<1||n>45))throw Error('Invalid numbers on '+date);
    if(r.bullseye!==null&&(!nums.includes(r.bullseye)||date<'2024-07-01'))throw Error('Invalid Bullseye on '+date);
    if(!Number.isFinite(r.jackpot_payout)||r.jackpot_payout<0)throw Error('Invalid payout on '+date);
    if(![2,3,4,5].includes(r.xtra))throw Error('Invalid XTRA on '+date);
    const item={date,draw_type:drawType,nums,bullseye:r.bullseye,xtra:r.xtra,jackpot_payout:r.jackpot_payout};
    if(drawType==='regular'&&date>='2024-07-01'&&r.bullseye===null)throw Error('Missing Bullseye on '+date);
    const id=date+'|'+drawType;
    if(found.has(id)&&JSON.stringify(found.get(id))!==JSON.stringify(item))throw Error('Conflicting official result '+id);
    found.set(id,item);
  }
  return [...found.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.draw_type.localeCompare(b.draw_type));
}
export function snapshot(draws){
  const regular=draws.filter(r=>r.draw_type==='regular'),dates=new Set(regular.map(r=>r.date));
  if(!regular.length)throw Error('Empty official archive');
  const first=regular[0].date,last=regular.at(-1).date,missing=[];
  for(let d=first;d<=last;d=nextDate(d))if(!dates.has(d))missing.push(d);
  return {source:SOURCE,checked_at:new Date().toISOString(),first_date:first,last_date:last,regular_draws:regular.length,promotional_draws:draws.length-regular.length,jackpot_paid_draws:draws.filter(r=>r.jackpot_payout>0).length,missing_dates:missing,calendar_note:'Daily except December 25. Promotional second draws retained separately.',coverage_note:'Current 5-of-45 era begins June 29, 2020. Earlier number-pool eras are not included.',draws};
}
