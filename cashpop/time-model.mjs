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
export function clockDistance(a,b){const delta=Math.abs(a-b);return Math.min(delta,1440-delta);}
export function clockLabel(minute){const h=Math.floor(minute/60);return `${h%12||12}:${String(minute%60).padStart(2,'0')} ${h<12?'AM':'PM'}`;}
export function exactTimes(data,number,{year='all',era='all',weekday='all',target=840,radius=4,all=false}={}){
  const times=new Map();for(const b of data.bins){if(year!=='all'&&b.year!==Number(year)||era!=='all'&&b.era!==era||weekday!=='all'&&b.weekday!==Number(weekday))continue;const time=b.hour*60+b.minute;if(!all&&clockDistance(time,target)>radius)continue;const r=times.get(time)??{time,hits:0,draws:0,distance:clockDistance(time,target)};r.hits+=b.counts[number-1];r.draws+=b.counts.reduce((s,n)=>s+n,0);times.set(time,r);}return [...times.values()].sort((a,b)=>a.distance-b.distance||a.time-b.time);
}
export function matchingOccurrences(data,{year='all',era='all',weekday='all',target=840,radius=4,all=false,order='closest'}={}){
  const rows=data.hits.map(([draw_no,date_time],i)=>{const hour=Number(date_time.slice(11,13)),minute=Number(date_time.slice(14,16)),day=(new Date(date_time.slice(0,10)+'T12:00:00Z').getUTCDay()+6)%7;return {draw_no,date_time,year:Number(date_time.slice(0,4)),era:date_time.slice(0,10)<'2022-06-27'?'15min':'4min',weekday:day,distance:clockDistance(hour*60+minute,target),previous_draw_span:i?draw_no-data.hits[i-1][0]:null};}).filter(r=>(year==='all'||r.year===Number(year))&&(era==='all'||r.era===era)&&(weekday==='all'||r.weekday===Number(weekday))&&(all||r.distance<=radius));
  return rows.sort((a,b)=>order==='newest'?b.draw_no-a.draw_no:order==='oldest'?a.draw_no-b.draw_no:a.distance-b.distance||b.draw_no-a.draw_no);
}
