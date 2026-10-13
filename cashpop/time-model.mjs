export function analyzeTime(data,{year='all',era='all',weekday='all'}={}){
  if(data.schema!==1||!Array.isArray(data.bins))throw new Error('Invalid time archive');
  const hours=Array.from({length:24},(_,hour)=>({hour,total:0,counts:Array(15).fill(0)}));
  for(const bin of data.bins){if(year!=='all'&&bin.year!==Number(year)||era!=='all'&&bin.era!==era||weekday!=='all'&&bin.weekday!==Number(weekday))continue;if(!Number.isInteger(bin.hour)||bin.hour<0||bin.hour>23||bin.counts.length!==15||bin.counts.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Invalid time bin');for(let i=0;i<15;i++){hours[bin.hour].counts[i]+=bin.counts[i];hours[bin.hour].total+=bin.counts[i];}}
  const totals=Array(15).fill(0);for(const h of hours)h.counts.forEach((n,i)=>totals[i]+=n);const count=totals.reduce((s,n)=>s+n,0);
  for(const h of hours){h.rates=h.counts.map(n=>h.total?n/h.total:null);h.deltas=h.rates.map((r,i)=>r===null?null:r-(count?totals[i]/count:0));}
  const active=hours.filter(h=>h.total),columns=totals.filter(n=>n>0).length;let chi=0,small=0;
  for(const h of active)for(let i=0;i<15;i++){const expected=h.total*totals[i]/count;if(expected){if(expected<5)small++;chi+=(h.counts[i]-expected)**2/expected;}}
  const divisor=count*Math.min(active.length-1,columns-1),association=divisor>0?Math.sqrt(chi/divisor):null;
  return {hours,totals,count,association,small_expected_cells:small};
}
export function rankedHours(analysis,number,minDraws=100){return analysis.hours.filter(h=>h.total>=minDraws).sort((a,b)=>b.rates[number-1]-a.rates[number-1]||a.hour-b.hour);}
export function hourLabel(hour){return `${hour%12||12} ${hour<12?'AM':'PM'}–${(hour+1)%12||12} ${(hour+1)%24<12?'AM':'PM'}`;}
