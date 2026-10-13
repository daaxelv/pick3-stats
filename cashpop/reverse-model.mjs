import {clockDistance} from './time-model.mjs';
export function reverseRanking(data,{target=840,radius=0,year='all',weekday='all',era='all'}={}){
 const counts=Array(15).fill(0);let draws=0;
 for(const b of data.bins){if(year!=='all'&&b.year!==Number(year)||weekday!=='all'&&b.weekday!==Number(weekday)||era!=='all'&&b.era!==era||clockDistance(b.hour*60+b.minute,target)>radius)continue;
 b.counts.forEach((n,i)=>{counts[i]+=n;draws+=n;});}
 return {draws,rows:counts.map((hits,i)=>({number:i+1,hits,share:draws?hits/draws:null})).sort((a,b)=>b.hits-a.hits||a.number-b.number)};
}
export function drawingAt(rows,date,time){return rows.filter(r=>r.date_time===`${date}T${time}`);}
