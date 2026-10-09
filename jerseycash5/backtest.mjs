import {analyze,rank,rng,randomTicket,key} from './model.mjs';

export const MODELS=['blended','frequency','jackpot','pairs','recent','overdue'];
export const LABELS={blended:'Blended history',frequency:'Overall frequency',jackpot:'Jackpot-paid frequency',pairs:'Pair frequency',recent:'Recent 90 draws',overdue:'Draws overdue',uniform:'Uniform baseline · trial 1'};
export const MIN_TRAINING=180, BASELINE_TRIALS=20;

export function planBacktest(input,window='365'){
  if(!['90','365','all'].includes(String(window)))throw Error('Invalid backtest window');
  const rows=input.filter(r=>r.draw_type==='regular').slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(new Set(rows.map(r=>r.date)).size!==rows.length)throw Error('Duplicate regular drawing dates');
  const candidates=rows.filter(r=>rows.filter(t=>t.date<r.date.slice(0,7)+'-01').length>=MIN_TRAINING);
  const evaluation=window==='all'?candidates:candidates.slice(-Number(window));
  if(!evaluation.length)throw Error('Not enough history: each month needs at least 180 earlier regular draws');
  const months=[...new Set(evaluation.map(r=>r.date.slice(0,7)))];
  return months.map(month=>({month,training:rows.filter(r=>r.date<month+'-01'),draws:evaluation.filter(r=>r.date.startsWith(month))}));
}
export function baselineTickets(seed,month,trial){
  const monthCode=Number(month.replace('-',''));
  const random=rng((seed^Math.imul(monthCode,2654435761)^Math.imul(trial+1,2246822519))>>>0),tickets=[],seen=new Set();
  while(tickets.length<10){const t=randomTicket(random);if(!seen.has(key(t))){seen.add(key(t));tickets.push(t);}}
  return tickets;
}
export function evaluateTickets(tickets,draws){
  const counts=[0,0,0,0,0,0],details=[];
  for(const d of draws)for(const t of tickets){const matches=t.nums.filter(n=>d.nums.includes(n)).length;counts[matches]++;
    if(matches>=3)details.push({date:d.date,ticket:key(t),winning:key(d),matches,bullseye:d.bullseye??null,includesBullseye:d.bullseye==null?null:t.nums.includes(d.bullseye)});
  }
  return {counts,details};
}
function total3(counts){return counts[3]+counts[4]+counts[5];}
// Selections are frozen for each calendar month. Every training cutoff precedes
// all evaluated outcomes, including months only partially inside the window.
export function runBacktest(rows,{window='365',seed=2026}={},progress=()=>{}){
  if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be a whole number from 0 to 4294967295');
  const plan=planBacktest(rows,window),monthly=[],details=[],selections=[],totals=new Map(),previous=new Map(),unique=new Map(),baselineTotals=Array(BASELINE_TRIALS).fill(0);
  for(const method of [...MODELS,'uniform']){totals.set(method,{model:method,counts:[0,0,0,0,0,0],repeatedSlots:0,selectionSlots:0,months:0,draws:0});unique.set(method,new Set());}
  plan.forEach((p,index)=>{
    progress({month:p.month,index:index+1,total:plan.length});const a=analyze(p.training),baselineResults=[];
    for(let trial=0;trial<BASELINE_TRIALS;trial++){const tickets=baselineTickets(seed,p.month,trial),result=evaluateTickets(tickets,p.draws);baselineResults.push(result);baselineTotals[trial]+=total3(result.counts);}
    for(const method of [...MODELS,'uniform']){
      const tickets=method==='uniform'?baselineTickets(seed,p.month,0):rank(a,method,false),result=method==='uniform'?baselineResults[0]:evaluateTickets(tickets,p.draws),ids=tickets.map(key),prior=previous.get(method),repeated=prior?ids.filter(id=>prior.has(id)).length:0;
      previous.set(method,new Set(ids));ids.forEach(id=>unique.get(method).add(id));const t=totals.get(method);result.counts.forEach((c,i)=>t.counts[i]+=c);t.repeatedSlots+=repeated;t.selectionSlots+=10;t.months++;t.draws+=p.draws.length;
      monthly.push({model:method,month:p.month,trainingDraws:p.training.length,trainingThrough:p.training.at(-1).date,testFirst:p.draws[0].date,testLast:p.draws.at(-1).date,draws:p.draws.length,ticketsScored:p.draws.length*10,counts:result.counts,threePlus:total3(result.counts),repeatedFromPriorMonth:prior?repeated:null,baselineMin:Math.min(...baselineResults.map(r=>total3(r.counts))),baselineMax:Math.max(...baselineResults.map(r=>total3(r.counts)))});
      selections.push(...tickets.map((t,i)=>({model:method,month:p.month,rank:i+1,ticket:key(t),trainingThrough:p.training.at(-1).date})));
      details.push(...result.details.map(r=>({...r,model:method,month:p.month})));
    }
  });
  const baselineMean=baselineTotals.reduce((s,n)=>s+n,0)/BASELINE_TRIALS;
  return {version:1,settings:{window:String(window),seed,minTraining:MIN_TRAINING,baselineTrials:BASELINE_TRIALS,retrain:'calendar month',ticketsPerModel:10},firstDate:plan[0].draws[0].date,lastDate:plan.at(-1).draws.at(-1).date,baseline:{totals:baselineTotals,mean:baselineMean,min:Math.min(...baselineTotals),max:Math.max(...baselineTotals)},summary:[...totals.values()].map(t=>({...t,ticketsScored:t.draws*10,threePlus:total3(t.counts),uniqueSets:unique.get(t.model).size,baselineDifference:total3(t.counts)-baselineMean})),monthly,details,selections};
}
