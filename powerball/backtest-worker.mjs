import {backtest} from './research.mjs';
self.onmessage=({data:rows})=>{try{self.postMessage(backtest(rows));}catch(e){self.postMessage({error:e.message});}};
