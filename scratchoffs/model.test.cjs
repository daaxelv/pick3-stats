const {test}=require('node:test');const assert=require('node:assert/strict');const {key,bracket,enrich}=require('./model.js');
test('ZIPs retain leading zero and match complete store address',()=>{
 const zips={[key(' 10 Main St ','Town')]:{zip:'07001',source:'Census matched street address'}};
 const income={period:'2020–2024',entries:{'07001':{median_income:100000,margin_of_error:5000}}};
 const r=enrich({address:'10 MAIN ST',town:'town'},zips,income);
 assert.equal(r.zip,'07001');assert.equal(r.income_bracket,'$100,000–$149,999');assert.equal(r.margin_of_error,5000);
 assert.equal(enrich({address:'20 Main St',town:'Town'},zips,income).zip,'');
});
test('Missing income is unavailable and bracket boundaries are consistent',()=>{assert.equal(bracket(null),'Unavailable');assert.equal(bracket(49999),'Under $50,000');assert.equal(bracket(50000),'$50,000–$74,999');assert.equal(bracket(150000),'$150,000+');});
