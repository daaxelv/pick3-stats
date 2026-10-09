import {analyze,rank,weights,rng,randomTicket,draw,tier,tiers,fullCounts,witnesses} from './model.mjs';
import {nextDate} from './data.mjs';
self.onmessage=({data:o})=>{try{
  if(o.task==='rank'){self.postMessage({type:'rank',plays:rank(analyze(o.rows),o.method,o.exclude)});return;}
  if(!Number.isInteger(o.crowd)||o.crowd<1||o.crowd>1000000||!Number.isInteger(o.draws)||o.draws<1||o.draws>1000)throw Error('Invalid crowd or draw count');
  const random=rng(o.seed),drawingRandom=rng(o.seed^0xA53C9E71),packed=new Uint8Array(o.mode==='full'?0:o.crowd*5),w=o.method==='uniform'?null:weights(analyze(o.rows),o.method);
  if(o.mode!=='full')for(let i=0;i<o.crowd;i++)packed.set(randomTicket(random,w).nums,i*5);
  let date=o.start;
  for(let j=0;j<o.draws;j++){date=nextDate(date);const d=draw(drawingRandom);self.postMessage({type:'drawing',date,draw:d,index:j+1});let counts=Array(tiers.length).fill(0),winners=[];
    if(o.mode==='full'){counts=fullCounts();winners=witnesses(d).map((t,k)=>({...t,tier:k,ticketId:'Representative',multiplicity:counts[k]}));}
    else{const mask=new Uint8Array(46);d.nums.forEach(n=>mask[n]=1);for(let i=0;i<o.crowd;i++){let m=0,b=false;for(let k=0;k<5;k++){const n=packed[i*5+k];m+=mask[n];b||=n===d.bullseye;}const k=m===5?0:m===4?(b?1:2):m===3?(b?3:4):m===2&&b?5:-1;if(k>=0)counts[k]++;if(k>=0&&k<3)winners.push({nums:Array.from(packed.subarray(i*5,i*5+5)),tier:k,ticketId:i+1,multiplicity:1});}}
    self.postMessage({type:'result',date,draw:d,index:j+1,counts,winners});if(o.until&&counts[0])break;
  }
  self.postMessage({type:'done'});
}catch(e){self.postMessage({type:'error',message:e.message});}};
