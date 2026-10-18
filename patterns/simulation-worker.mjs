import {prepareStep,evaluateStep,VERSION} from './simulation.mjs?v=studies-2';
let stopped=false,ack=null;
self.onmessage=async({data})=>{
 if(data.type==='ack'){const next=ack;ack=null;next?.();return;}
 if(data.type==='stop'){stopped=true;return;}
 if(data.type!=='start')return;
 const {run,steps}=data;
 const checkpoint=message=>new Promise(resolve=>{ack=resolve;self.postMessage(message);});
 try{
  if(run.version!==VERSION)throw Error('This run uses an unsupported journal version. Export it before starting a new run.');
  const done=new Set(steps.filter(s=>s.status==='scored').map(s=>s.index)),pending=new Map(steps.filter(s=>s.status==='prepared').map(s=>[s.index,s]));
  for(let index=0;index<run.total;index++){
   if(stopped)break;if(done.has(index))continue;
   const prepared=pending.get(index)??prepareStep(run,index);
   await checkpoint({type:'prepared',step:prepared}); // Main thread must commit the drawing before scoring.
   const step=evaluateStep(run,prepared);
   await checkpoint({type:'scored',step}); // Results and progress commit atomically before continuing.
  }
  self.postMessage({type:stopped?'paused':'complete'});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
