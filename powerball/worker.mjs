import {rng,randomTicket,tier,nextDate,fullCounts,witnesses} from './model.mjs';
self.onmessage=({data:o})=>{try{const random=rng(o.seed),crowd=new Uint8Array(o.crowd*6);if(o.mode!=='full')for(let i=0;i<o.crowd;i++){const t=randomTicket(random,o.focus);crowd.set([...t.nums,t.pb],i*6);}let date=o.start;
for(let j=0;j<o.draws;j++){date=nextDate(date);const draw=randomTicket(random);self.postMessage({type:'drawing',date,draw,index:j+1});let counts=Array(9).fill(0),winners=[];
if(o.mode==='full'){counts=fullCounts();winners=witnesses(draw).map((t,k)=>({...t,tier:k,ticketId:'Representative',multiplicity:counts[k]}));}
else for(let i=0;i<o.crowd;i++){const t={nums:Array.from(crowd.subarray(i*6,i*6+5)),pb:crowd[i*6+5]},k=tier(t,draw);if(k>=0)counts[k]++;if(k>=0&&k<3)winners.push({...t,tier:k,ticketId:i+1,multiplicity:1});}
self.postMessage({type:'result',date,draw,index:j+1,counts,winners});if(o.until&&counts[0]>0)break;}
self.postMessage({type:'done'});}catch(e){self.postMessage({type:'error',message:e.message});}};
