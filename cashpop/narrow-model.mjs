import {analyzeTime} from './time-model.mjs';
import {reverseRanking} from './reverse-model.mjs';
import {drawAge} from './research.mjs';

// Competition ranks: equal values share a rank; the next rank skips tied places.
export function ranks(rows,key,descending=true){
 const sorted=rows.filter(r=>Number.isFinite(r[key])).sort((a,b)=>(descending?b[key]-a[key]:a[key]-b[key])||a.number-b.number),out=new Map();
 sorted.forEach((r,i)=>out.set(r.number,i&&r[key]===sorted[i-1][key]?out.get(sorted[i-1].number):i+1));return out;
}
export function buildComparison(archive,summary,options={}){
 if(archive.coverage.last_draw!==summary.coverage.last_draw||archive.coverage.loaded_draws!==summary.coverage.loaded_draws)throw new Error('Archive snapshots differ. Refresh after the data update finishes.');
 const cohort=analyzeTime(archive,options),time=reverseRanking(archive,options),timeBy=new Map(time.rows.map(r=>[r.number,r]));
 const rows=Array.from({length:15},(_,i)=>{const number=i+1,last=summary.groups.all.rows.find(r=>r.number===number),age=last?drawAge(last,summary.coverage):{known:null,span:null,missing:null},t=timeBy.get(number);return {number,frequencyHits:cohort.count?cohort.totals[i]:null,frequencyShare:cohort.count?cohort.totals[i]/cohort.count:null,lastDate:last?.last_date??null,knownGap:age.known,drawSpan:age.span,missingGap:age.missing,gapValue:age.missing===0?age.known:null,timeHits:time.draws?t.hits:null,timeDraws:time.draws,timeShare:t.share};});
 const fr=ranks(rows,'frequencyHits'),gr=ranks(rows,'gapValue'),short=ranks(rows,'gapValue',false),tr=ranks(rows,'timeHits');
 const weights=options.weights??[1,1,1];if(weights.length!==3||weights.some(w=>!Number.isFinite(w)||w<0))throw new Error('Weights must be nonnegative numbers');
 for(const r of rows){r.frequencyRank=fr.get(r.number)??null;r.gapRank=gr.get(r.number)??null;r.timeRank=tr.get(r.number)??null;r.preferredGapRank=(options.gapPreference==='short'?short:gr).get(r.number)??null;
  const metrics=[r.frequencyRank,r.preferredGapRank,r.timeRank];r.components=metrics.map((rank,i)=>({metric:['Frequency','Gap preference','Selected time'][i],rank,weight:weights[i],normalized:rank===null?null:100*(15-rank)/14}));
  const available=r.components.filter(c=>c.rank!==null&&c.weight>0),weight=available.reduce((s,c)=>s+c.weight,0);r.score=weight?available.reduce((s,c)=>s+c.normalized*c.weight,0)/weight:null;r.partial=r.components.some(c=>c.weight>0&&c.rank===null);r.usedWeight=weight;
 }
 const sr=ranks(rows,'score');for(const r of rows)r.scoreRank=sr.get(r.number)??null;
 return {rows,frequencyDraws:cohort.count,timeDraws:time.draws,coverage:summary.coverage};
}
export function passesFilters(row,{frequencyMax=0,gapMax=0,timeMax=0,match='all'}={}){
 const tests=[[frequencyMax,row.frequencyRank],[gapMax,row.gapRank],[timeMax,row.timeRank]].filter(([max])=>max>0).map(([max,rank])=>rank!==null&&rank<=max);
 return !tests.length||(match==='any'?tests.some(Boolean):tests.every(Boolean));
}
export function sortComparison(rows,key='score',direction='desc'){
 return [...rows].sort((a,b)=>{const x=a[key],y=b[key];if(x===null||x===undefined)return y===null||y===undefined?a.number-b.number:1;if(y===null||y===undefined)return -1;const d=typeof x==='string'?x.localeCompare(y):x-y;return (direction==='asc'?d:-d)||a.number-b.number;});
}
export function csvComparison(rows,metadata){
 const keys=['number','frequencyRank','frequencyHits','frequencyShare','lastDate','knownGap','drawSpan','missingGap','gapRank','preferredGapRank','timeRank','timeHits','timeDraws','timeShare','score','scoreRank','partial'];
 const quote=v=>'"'+String(v??'Unavailable').replaceAll('"','""')+'"';
 return '\uFEFF'+[...Object.entries(metadata).map(([k,v])=>[quote(k),quote(typeof v==='object'?JSON.stringify(v):v)].join(',')),keys.join(','),...rows.map(r=>keys.map(k=>quote(r[k])).join(','))].join('\r\n');
}
