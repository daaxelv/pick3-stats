import {makeCrowd} from './research.mjs';
self.onmessage=event=>{try{self.postMessage({ok:true,crowd:makeCrowd(event.data.count,event.data.weights,event.data.seed)});}catch(error){self.postMessage({ok:false,error:error.message});}};
