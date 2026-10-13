import {exactTimes,clockDistance} from './time-model.mjs';
export function numberPatterns(data,number,filters={}){
  const times=exactTimes(data,number,{...filters,all:true});
  const rank=rows=>rows.filter(r=>r.hits).sort((a,b)=>b.hits-a.hits||a.time-b.time);
  const weekdays=[];
  for(let day=0;day<7;day++){
    if(filters.weekday!=='all'&&filters.weekday!==undefined&&Number(filters.weekday)!==day)continue;
    weekdays.push(...exactTimes(data,number,{...filters,weekday:String(day),all:true}).map(r=>({...r,weekday:day})));
  }
  const radius=Number(filters.radius??4);
  const clusters=times.map(t=>{const nearby=times.filter(r=>clockDistance(r.time,t.time)<=radius);return {time:t.time,hits:nearby.reduce((s,r)=>s+r.hits,0),draws:nearby.reduce((s,r)=>s+r.draws,0)};});
  return {times:rank(times),weekdays:rank(weekdays),clusters:rank(clusters),radius};
}
