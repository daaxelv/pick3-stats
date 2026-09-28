// Browser port of the supplied G.O.D. v1.1 research features. Rankings are
// descriptive scores; physical measurements and Cash4Life priors are absent.
export const CFG = {
  origin: {freq:.80,recent:.90,gap:.35,carry:.40,transition:.70,weekday:.30},
  physical: {freq:.55,recent:.45,gap:.20,carry:.30},
  decay:.94, prior:58, transitionPrior:25, mbScale:.25
};
const range = n => Array.from({length:n},(_,i)=>i+1);
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const z = a => { const m=mean(a), sd=Math.sqrt(mean(a.map(x=>(x-m)**2))); return a.map(x=>sd<1e-12?0:(x-m)/sd); };
const softmax = a => {const max=Math.max(...a), exp=a.map(x=>Math.exp(x-max)), total=exp.reduce((x,y)=>x+y,0);return exp.map(x=>x/total);};
export function parseRows(text) {
  const lines=text.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const head=lines.shift().split(',').map(x=>x.trim().toLowerCase());
  const ix=(...names)=>head.findIndex(x=>names.includes(x));
  const game=ix('game'), date=ix('date','draw_date'), nums=ix('digits','winning_numbers','numbers','main_numbers'), mb=ix('fireball','mill_ball','millionaire_ball','mb');
  if(date<0||nums<0||mb<0) throw Error('CSV needs a date, five winning numbers, and Millionaire Ball column.');
  const byDate=new Map();
  for(const line of lines){
    const cells=line.split(','); if(game>=0 && cells[game].trim().toUpperCase()!=='M4L') continue;
    const day=cells[date]?.trim(), main=(cells[nums]||'').match(/\d+/g)?.map(Number) || [], ball=Number(cells[mb]);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||main.length!==5||new Set(main).size!==5||main.some(n=>n<1||n>58)||ball<1||ball>5||!Number.isInteger(ball)) continue;
    main.sort((a,b)=>a-b);
    const row={date:day,nums:main,mb:ball};
    if(byDate.has(day) && (byDate.get(day).nums.join()!==main.join()||byDate.get(day).mb!==ball))
      throw Error('Conflicting results for '+day+'. Check the CSV before scoring.');
    byDate.set(day,row);
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function numberStats(hist,targetDate){
  const counts=Array(58).fill(0), recent=Array(58).fill(0), last=Array(58).fill(-1), week=Array(58).fill(0), trans=Array.from({length:58},()=>Array(58).fill(0)), exposure=Array(58).fill(0);
  const weekday=new Date(targetDate+'T12:00:00Z').getUTCDay(); let weekN=0, weightSum=0;
  for(let i=0;i<hist.length;i++){
    const r=hist[i], age=hist.length-1-i, weight=CFG.decay**age;
    weightSum+=weight;
    for(const n of r.nums){counts[n-1]++;recent[n-1]+=weight;last[n-1]=i;}
    if(new Date(r.date+'T12:00:00Z').getUTCDay()===weekday){weekN++;for(const n of r.nums)week[n-1]++;}
    if(i+1<hist.length) for(const n of r.nums){exposure[n-1]++;for(const next of hist[i+1].nums)trans[n-1][next-1]++;}
  }
  const prior=CFG.prior, base=5/58, lastDraw=hist.at(-1)?.nums||[];
  return {
    freq:counts.map(c=>(c+prior*base)/(hist.length+prior)),
    recent:recent.map(x=>x/Math.max(weightSum,1e-12)),
    gap:last.map(i=>Math.log1p(i<0?hist.length:hist.length-1-i)),
    carry:range(58).map(n=>lastDraw.includes(n)?1:0),
    weekday:week.map(c=>(c+prior*base)/(weekN+prior)),
    transition:range(58).map(j=>lastDraw.length ? mean(lastDraw.map(i=>(trans[i-1][j-1]+CFG.transitionPrior*base)/(exposure[i-1]+CFG.transitionPrior))) : 0)
  };
}
function mbWeights(hist,targetDate){
  const counts=Array(5).fill(0),recent=Array(5).fill(0),week=Array(5).fill(0);
  const weekday=new Date(targetDate+'T12:00:00Z').getUTCDay();let weightSum=0,weekN=0;
  for(let i=0;i<hist.length;i++){
    const r=hist[i],weight=CFG.decay**(hist.length-1-i);weightSum+=weight;counts[r.mb-1]++;recent[r.mb-1]+=weight;
    if(new Date(r.date+'T12:00:00Z').getUTCDay()===weekday){week[r.mb-1]++;weekN++;}
  }
  const repeat=range(5).map(n=>n===hist.at(-1)?.mb?1:0);
  const parts=[counts.map(c=>(c+1)/(hist.length+5)),recent.map(x=>x/Math.max(weightSum,1e-12)),repeat,week.map(c=>(c+1)/(weekN+5))].map(z);
  return softmax(range(5).map((_,i)=>CFG.mbScale*(.9*parts[0][i]+.8*parts[1][i]+.25*parts[2][i]+.25*parts[3][i])));
}
export function scoreModel(hist,targetDate,model='origin',profile='conservative'){
  if(!hist.length) throw Error('Load prior draws first.');
  if(!['origin','physical','uniform'].includes(model)) throw Error('Unknown model');
  if(!['conservative','default'].includes(profile)) throw Error('Unknown profile');
  if(model==='uniform') return {main:Array(58).fill(5/58),mb:Array(5).fill(.2)};
  const features=numberStats(hist,targetDate), weights=CFG[model], shrink=profile==='conservative'?.25:1;
  const standardized=Object.fromEntries(Object.entries(features).map(([key,values])=>[key,z(values)]));
  const mainScores=range(58).map((_,i)=>Object.entries(weights).reduce((sum,[name,w])=>sum+shrink*w*standardized[name][i],0));
  // The supplied physical measurements were absent. Its physics feature is exactly zero.
  const main=softmax(mainScores).map(x=>x*5);
  return {main,mb:mbWeights(hist,targetDate)};
}
export function backtest(rows,profile='conservative',minTrain=60){
  if(rows.length<=minTrain) throw Error('Need more draws than the minimum training window.');
  const names=['origin','physical','uniform'], out=Object.fromEntries(names.map(n=>[n,{name:n,tested:0,top5:0,top10:0,rank:0,mbTop1:0,logMain:0,logMB:0}]));
  for(let i=minTrain;i<rows.length;i++){
    const hist=rows.slice(0,i), actual=rows[i];
    for(const name of names){
      const {main,mb}=scoreModel(hist,actual.date,name,profile), order=range(58).sort((a,b)=>main[b-1]-main[a-1]||a-b);
      const ranks=actual.nums.map(n=>order.indexOf(n)+1), o=out[name];
      o.tested++;o.top5+=ranks.filter(n=>n<=5).length;o.top10+=ranks.filter(n=>n<=10).length;o.rank+=mean(ranks);
      const mbOrder=range(5).sort((a,b)=>mb[b-1]-mb[a-1]||a-b);
      if(mbOrder[0]===actual.mb)o.mbTop1++;
      o.logMB+=Math.log(Math.max(mb[actual.mb-1],1e-12));
      for(let n=1;n<=58;n++){const p=Math.min(1-1e-12,Math.max(1e-12,main[n-1]/5));o.logMain+=actual.nums.includes(n)?Math.log(p):Math.log(1-p);}
    }
  }
  return Object.fromEntries(names.map(n=>{const o=out[n], d=o.tested;return [n,{tested:d,top5:o.top5/d,top10:o.top10/d,rank:o.rank/d,mbTop1:o.mbTop1/d,logMain:o.logMain/d,logMB:o.logMB/d}];}));
}
export function candidateTickets(weights,count=10,only04=false,seed=20260927){
  let state=seed>>>0;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const result=[],seen=new Set();
  for(let attempts=0;result.length<count&&attempts<count*500;attempts++){
    const nums=only04?[4]:[],available=range(58).filter(n=>!nums.includes(n));
    while(nums.length<5){const total=available.reduce((sum,n)=>sum+weights.main[n-1],0), threshold=random()*total;let v=0,j=0;
      for(;j<available.length-1;j++){v+=weights.main[available[j]-1];if(v>=threshold)break;}nums.push(available.splice(j,1)[0]);}
    nums.sort((a,b)=>a-b);
    let mb=4;if(!only04){const t=random(),c=[];weights.mb.reduce((sum,p)=>{c.push(sum+p);return sum+p;},0);mb=1+c.findIndex(x=>x>=t);}
    const key=nums.join('-')+'-'+mb;if(seen.has(key))continue;seen.add(key);result.push({nums,mb,score:nums.reduce((sum,n)=>sum+Math.log(weights.main[n-1]),0)+Math.log(weights.mb[mb-1])});
  }
  return result.sort((a,b)=>b.score-a.score);
}
