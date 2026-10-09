import {runBacktest} from './backtest.mjs';
self.onmessage=({data:o})=>{try{const result=runBacktest(o.rows,o.settings,p=>self.postMessage({type:'progress',...p}));self.postMessage({type:'done',result});}catch(e){self.postMessage({type:'error',message:e.message});}};
