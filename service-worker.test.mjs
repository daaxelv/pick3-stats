import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('./service-worker.js',import.meta.url),'utf8');
function harness(fetch, cached) {
  const handlers={}, writes=[];
  vm.runInNewContext(script,{URL,Response,Headers,fetch,
    self:{addEventListener:(event,fn)=>handlers[event]=fn},
    caches:{match:async()=>cached?.clone(),open:async()=>({put:(req,response)=>writes.push(response.status)})}});
  return {writes,async request(){let result;handlers.fetch({request:new Request('https://example.com/data/nj_numbers_canonical.csv'),respondWith:promise=>result=promise});return await result;}};
}
test('offline or HTTP error results use marked cache without overwriting it',async()=>{
  for(const fetch of [async()=>{throw Error('offline');},async()=>new Response('server error',{status:500})]) {
    const app=harness(fetch,new Response('saved CSV'));
    const response=await app.request();
    assert.equal(response.headers.get('X-Pick3-Cached'),'1');
    assert.equal(await response.text(),'saved CSV');
    assert.deepEqual(app.writes,[]);
  }
});
test('successful results fetch replaces cache and is not marked offline',async()=>{
  const app=harness(async()=>new Response('new CSV'),new Response('old CSV'));
  const response=await app.request();
  assert.equal(await response.text(),'new CSV');
  assert.equal(response.headers.get('X-Pick3-Cached'),null);
  assert.deepEqual(app.writes,[200]);
});
