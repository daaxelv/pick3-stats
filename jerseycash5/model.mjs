export const TOTAL=1221759;
export const key=t=>t.nums.join('-');
export function choose(n,k){if(k<0||k>n)return 0;let c=1;for(let i=1;i<=k;i++)c=c*(n-i+1)/i;return Math.round(c);}
export const tiers=['Jackpot · 5/5','2nd · 4/5 with Bullseye','3rd · 4/5','4th · 3/5 with Bullseye','5th · 3/5','6th · 2/5 with Bullseye'];
export function tier(t,d){const m=t.nums.filter(n=>d.nums.includes(n)).length,b=t.nums.includes(d.bullseye);return m===5?0:m===4?(b?1:2):m===3?(b?3:4):m===2&&b?5:-1;}
export const fullCounts=()=>[1,choose(4,3)*40,40,choose(4,2)*choose(40,2),choose(4,3)*choose(40,2),choose(4,1)*choose(40,3)];
export function rng(seed){let s=seed>>>0;return ()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function randomTicket(random,weights=null){const nums=[];while(nums.length<5){let n;if(weights){const available=weights.filter(w=>!nums.includes(w.n));let x=random()*available.reduce((s,w)=>s+w.value,0);n=available.at(-1).n;for(const w of available){x-=w.value;if(x<0){n=w.n;break;}}}else n=1+Math.floor(random()*45);if(!nums.includes(n))nums.push(n);}return {nums:nums.sort((a,b)=>a-b)};}
export function draw(random){const t=randomTicket(random);return {...t,bullseye:t.nums[Math.floor(random()*5)]};}
export function analyze(rows){const pairs=new Map(),exact=new Map();const numbers=Array.from({length:45},(_,i)=>({n:i+1,hits:0,jackpotHits:0,recentHits:0,gap:rows.length,lastDate:'Never in coverage',bullseyeHits:0}));let paid=0;
  rows.forEach((r,i)=>{const jackpot=r.jackpot_payout>0;if(jackpot)paid++;exact.set(key(r),(exact.get(key(r))||0)+1);for(const n of r.nums){const s=numbers[n-1];s.hits++;s.jackpotHits+=+jackpot;s.recentHits+=+(i>=rows.length-90);s.gap=rows.length-i-1;s.lastDate=r.date;s.bullseyeHits+=+(r.bullseye===n);}for(let a=0;a<5;a++)for(let b=a+1;b<5;b++){const id=r.nums[a]+'-'+r.nums[b],p=pairs.get(id)||{numbers:id,hits:0,jackpotHits:0};p.hits++;p.jackpotHits+=+jackpot;pairs.set(id,p);}});
  return {numbers,pairs,exact,rows,paid};
}
export function weights(a,method='blended'){return a.numbers.map(s=>({n:s.n,value:method==='jackpot'?s.jackpotHits+1:method==='recent'?s.recentHits+1:method==='overdue'?s.gap+1:method==='uniform'?1:method==='blended'?0.6*(s.hits+1)/(a.rows.length+1)+0.4*(s.jackpotHits+1)/(a.paid+1):s.hits+1}));}
export function score(nums,a,method='blended'){
  if(method==='pairs')return nums.reduce((sum,n,i)=>sum+nums.slice(i+1).reduce((s,m)=>s+(a.pairs.get(n+'-'+m)?.hits||0),0),0);
  const w=weights(a,method);return nums.reduce((sum,n)=>sum+w[n-1].value,0);
}
export function rank(a,method='blended',exclude=false){
  if(!a.rows.length)throw Error('No historical draws in selected scope');
  if(method==='uniform'){const random=rng(2026),out=[],seen=new Set();while(out.length<10){const t=randomTicket(random);if(!seen.has(key(t))&&(!exclude||!a.exact.has(key(t)))){seen.add(key(t));out.push(t);}}return decorate(out,a,method);}
  const out=[],w=weights(a,method),pairValues=new Float64Array(46*46);for(const p of a.pairs.values()){const [n,m]=p.numbers.split('-').map(Number);pairValues[n*46+m]=p.hits;}
  for(let b1=1;b1<=41;b1++)for(let b2=b1+1;b2<=42;b2++)for(let b3=b2+1;b3<=43;b3++)for(let b4=b3+1;b4<=44;b4++)for(let b5=b4+1;b5<=45;b5++){
    const nums=[b1,b2,b3,b4,b5];let value=w[b1-1].value+w[b2-1].value+w[b3-1].value+w[b4-1].value+w[b5-1].value;
    if(method==='pairs')value=pairValues[b1*46+b2]+pairValues[b1*46+b3]+pairValues[b1*46+b4]+pairValues[b1*46+b5]+pairValues[b2*46+b3]+pairValues[b2*46+b4]+pairValues[b2*46+b5]+pairValues[b3*46+b4]+pairValues[b3*46+b5]+pairValues[b4*46+b5];
    if(out.length===10&&value<=out.at(-1).value)continue;
    if(exclude&&a.exact.has(nums.join('-')))continue;
    out.push({nums,value});out.sort((a,b)=>b.value-a.value);if(out.length>10)out.pop();
  }
  return decorate(out,a,method);
}
function decorate(tickets,a,method){return tickets.map(t=>({...t,id:key(t),score:t.value??score(t.nums,a,method),avgGap:t.nums.reduce((s,n)=>s+a.numbers[n-1].gap,0)/5,pastHits:a.exact.get(key(t))||0,explanation:t.nums.map(n=>{const s=a.numbers[n-1];return `${String(n).padStart(2,'0')}: ${s.hits} draws, ${s.jackpotHits} jackpot-paid draws`;}).join(' · ')}));}
export function witnesses(d){const outside=Array.from({length:45},(_,i)=>i+1).filter(n=>!d.nums.includes(n)),other=d.nums.filter(n=>n!==d.bullseye);return [{nums:d.nums.slice()},{nums:[d.bullseye,...other.slice(0,3),outside[0]].sort((a,b)=>a-b)},{nums:[...other,outside[0]].sort((a,b)=>a-b)}];}
