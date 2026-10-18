const DB='lottery-pattern-runs-v1';
let opening;
export function database(){if(!opening)opening=new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{request.result.createObjectStore('runs',{keyPath:'id'});request.result.createObjectStore('steps',{keyPath:['runId','index']});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return opening;}
async function transaction(stores,mode,work){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);let value;try{value=work(tx);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(typeof value==='function'?value():value);tx.onerror=()=>reject(tx.error||Error('Journal write failed'));tx.onabort=()=>reject(tx.error||Error('Journal transaction aborted'));});}
export const putRun=run=>transaction(['runs'],'readwrite',tx=>{tx.objectStore('runs').put(run);});
export const listRuns=()=>transaction(['runs'],'readonly',tx=>{const r=tx.objectStore('runs').getAll();return()=>r.result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));});
export const loadRun=id=>transaction(['runs','steps'],'readonly',tx=>{const r=tx.objectStore('runs').get(id),s=tx.objectStore('steps').getAll(IDBKeyRange.bound([id,0],[id,Infinity]));return()=>({run:r.result,steps:s.result});});
export const commitStep=(run,step)=>transaction(['runs','steps'],'readwrite',tx=>{tx.objectStore('steps').put({...step,runId:run.id});tx.objectStore('runs').put(run);});
