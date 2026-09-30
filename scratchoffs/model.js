(function(root){
'use strict';
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toUpperCase();
const key=(address,town)=>norm(address)+'|'+norm(town);
function bracket(n){return n==null?'Unavailable':n<50000?'Under $50,000':n<75000?'$50,000–$74,999':n<100000?'$75,000–$99,999':n<150000?'$100,000–$149,999':'$150,000+';}
function enrich(row,zips,income){
 const match=zips[key(row.address,row.town)];
 const zip=/^\d{5}(?:-\d{4})?$/.test(row.zip||'')?row.zip.slice(0,5):match?.zip||'';
 const area=income.entries?.[zip];
 return {...row,zip,zip_source:row.zip?'NJ Lottery retailer address':match?.source||'Unmatched',median_income:area?.median_income??null,margin_of_error:area?.margin_of_error??null,income_bracket:bracket(area?.median_income),income_period:income.period||'2020–2024'};
}
const api={key,bracket,enrich};root.ScratchModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
