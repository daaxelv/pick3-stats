import {games,names,options,generate,historyMatches,exactMatches,validate} from './model.mjs?v=nj-1';
export function analyze(rows,game,raw={},seed=12345,recentCount=30){
 const c=games[game],o=options(game,raw);
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be an integer from 0–4294967295');
 if(!Number.isInteger(recentCount)||recentCount<1)throw Error('Recent window must be positive');
 const ordered=[...rows].sort((a,b)=>a.date.localeCompare(b.date));ordered.forEach(t=>validate(t,game));
 if(!ordered.length)return {findings:[],candidates:[],count:0};
 const main=Array(c.max+1).fill(0),bonus=Array(c.bonusMax+1).fill(0);
 ordered.forEach(t=>{t.nums.forEach(n=>main[n]++);if(c.bonusMax)bonus[t.bonus]++;});
 const mainMax=Math.max(...main),bonusMax=Math.max(...bonus),recent=ordered.slice(-recentCount),map=new Map();
 const findings=Object.keys(names).map((pattern,i)=>{
  const hits=historyMatches(ordered,game,pattern,o),recentHits=historyMatches(recent,game,pattern,o);let generated=[],error='';
  try{generated=generate(game,pattern,o,50,(seed+i*7919)>>>0);}catch(e){error=e.message;}
  for(const t of generated){const key=t.nums.join('-')+'|'+t.bonus;if(!map.has(key))map.set(key,{...t,patterns:[]});map.get(key).patterns.push(pattern);}
  return {pattern,count:hits.length,percent:100*hits.length/ordered.length,recentCount:recentHits.length,recentTotal:recent.length,last:hits.at(-1)?.date??null,recentMatches:hits.slice(-5).reverse(),sampleSize:generated.length,error};
 });
 const candidates=[...map.values()].map(t=>{const mainScore=100*t.nums.reduce((s,n)=>s+main[n]/mainMax,0)/5,bonusScore=c.bonusMax?100*bonus[t.bonus]/bonusMax:null;
 return {...t,mainCounts:t.nums.map(n=>main[n]),bonusCount:c.bonusMax?bonus[t.bonus]:null,mainScore,bonusScore,score:c.bonusMax?(mainScore*5+bonusScore)/6:mainScore,exact:exactMatches(ordered,t)};
 }).sort((a,b)=>b.score-a.score||a.nums.join('-').localeCompare(b.nums.join('-'))||(a.bonus??0)-(b.bonus??0));
 candidates.forEach((t,i)=>{t.rank=i&&Math.abs(t.score-candidates[i-1].score)<1e-10?candidates[i-1].rank:i+1;});
 return {findings,candidates,count:ordered.length,first:ordered[0].date,latest:ordered.at(-1).date,mainMax,bonusMax,options:o,seed};
}
