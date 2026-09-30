(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value || '').trim().replace(/\s+/g,' ').toUpperCase();
  const addressKey = (address,town) => norm(address)+'|'+norm(town);
  const money = value => Number(String(value).replace(/[^0-9.]/g,'').match(/\d+(?:\.\d+)?/)?.[0] || 0);
  const fmt = value => new Intl.NumberFormat('en-US').format(value);
  const state = { games:[], winners:[], stores:[], archive:[], zipRows:[], coordinates:{}, mode:'winners', sort:'amount_number', descending:true, visible:[] };
  const map = window.L ? L.map('map', {scrollWheelZoom:false}).setView([40.08,-74.5],8) : null;
  if (map) L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
  let layer = map ? L.layerGroup().addTo(map) : null;
  const columns = {
    winners:[['game','Ticket / game'],['amount_number','Top prize'],['town','Town'],['retailer','Selling store'],['address','Address'],['status','Game status']],
    stores:[['town','Town'],['name','Retailer'],['address','Address'],['zip','ZIP'],['past_wins','Published top-prize sales']]
  };
  const incomeCols=[['zip','ZIP'],['median_income','Area median household income'],['income_bracket','Area bracket'],['margin_of_error','Income ± margin of error']];
  columns.winners.push(...incomeCols); columns.stores.push(...incomeCols.filter(c=>c[0]!=='zip'));
  columns.archive=[...columns.winners.filter(c=>c[0]!=='status'),['publication_date','Published'],['reported_date','Reported date']];
  columns.zips=[['zip','ZIP'],['town','Towns'],['winner_count','Top-prize location records'],['store_count','Retailers collected'],...incomeCols.filter(c=>c[0]!=='zip')];
  function cell(r,key){if(key==='amount_number')return safe(r.amount);if(key==='retailer')return safe(r.retailer)+(r.closed?' (no longer sells)':'');if(key==='median_income'||key==='margin_of_error')return r[key]==null?'Unavailable':'$'+fmt(r[key]);return safe(r[key]??'');}
  function update() {
    const search = norm($('search').value), town = norm($('town').value), status=$('status').value, min=Number($('minimum').value);
    const source = ({winners:state.winners,stores:state.stores,archive:state.archive,zips:state.zipRows})[state.mode];
    const visible = source.filter(r => (!town || (r.towns||[norm(r.town)]).includes(town)) && (!$('zip').value || r.zip===$('zip').value) && (!$('income').value || r.income_bracket===$('income').value) &&
      (['stores','zips','archive'].includes(state.mode) || ((!status || r.status===status) && r.amount_number>=min)) &&
      (!search || norm([r.game,r.name,r.retailer,r.town,r.address,r.zip].join(' ')).includes(search)));
    const field=state.sort, direction=state.descending?-1:1;
    visible.sort((a,b)=> direction*(['median_income','margin_of_error','amount_number','winner_count','store_count','past_wins'].includes(field) ? (a[field]??-1)-(b[field]??-1) : String(a[field]||'').localeCompare(String(b[field]||''))));
    state.visible=visible;
    $('head').innerHTML='<tr>'+columns[state.mode].map(([key,label])=>'<th scope="col" aria-sort="'+(field===key?(state.descending?'descending':'ascending'):'none')+'"><button type="button" data-sort="'+key+'">'+safe(label)+(field===key?(state.descending?' ↓':' ↑'):'')+'</button></th>').join('')+'</tr>';
    $('body').innerHTML=visible.slice(0,2000).map(r=>'<tr>'+columns[state.mode].map(([key])=>'<td>'+(key==='game'?'<a target="_blank" rel="noopener" href="'+safe(r.url)+'">'+safe(r.game)+'</a><small>'+safe(r.id?'#'+r.id:'')+'</small>':key==='zip'?cell(r,key)+'<small> '+safe(r.zip_source||'')+'</small>':cell(r,key))+'</td>').join('')+'</tr>').join('');
    $('listTitle').textContent=({winners:'Published top-prize locations',stores:'Current retailer search results',archive:'Older official winner reports',zips:'ZIP / area income cross-reference'})[state.mode];
    $('listInfo').textContent=fmt(visible.length)+' matching rows'+(visible.length>2000?' (first 2,000 shown; download CSV for all)':'');
    $('mapNote').textContent='Mapping '+fmt(visible.length)+' matching records. Addresses that did not match Census geocoding remain in the list.';
    if (!map) { $('mapNote').textContent='Map tiles unavailable. The searchable list and address links remain available.'; return; }
    layer.clearLayers();
    // Town aggregation keeps thousands of retailers usable on a phone. Selecting
    // one town switches to individual store coordinates.
    const byTown=new Map(), townSelected=!!town || !!$('zip').value || state.mode==='zips';
    let unmapped=0;
    for(const r of visible){
      const xy=r.xy||state.coordinates[addressKey(r.address,r.town)];
      if (!Array.isArray(xy) || xy.length!==2){unmapped++;continue;}
      if(townSelected){
        if(layer.getLayers().length>=800) continue;
        const label=state.mode==='zips'?'ZIP '+r.zip+' • '+r.winner_count+' winner records':state.mode==='stores'?r.name:r.game+' • '+r.amount;
        L.circleMarker(xy,{radius:7,weight:1,color:state.mode==='winners'?'#bd7415':'#075f67',fillColor:state.mode==='winners'?'#ffd37b':'#62e4d0',fillOpacity:.9})
          .bindPopup('<b>'+safe(label)+'</b><br>'+safe(r.address)+'<br>'+safe(r.town)+'<br>ZIP '+safe(r.zip||'unmatched')+' · '+safe(r.income_bracket)).addTo(layer);
      } else {
        const k=norm(r.town);
        const entry=byTown.get(k)||{town:r.town,count:0,xy};
        entry.count++;byTown.set(k,entry);
      }
    }
    if(!townSelected) for(const t of byTown.values()) L.circleMarker(t.xy,{radius:Math.min(26,6+Math.sqrt(t.count)*2.4),weight:2,color:state.mode==='winners'?'#a65a15':'#075f67',fillColor:state.mode==='winners'?'#ffd37b':'#62e4d0',fillOpacity:.76}).bindPopup('<b>'+safe(t.town)+'</b><br>'+fmt(t.count)+' mapped '+(state.mode==='winners'?'winner locations':'retailers')+'<br>Select this town in the filter for addresses.').on('click',()=>{ $('town').value=norm(t.town);update(); }).addTo(layer);
    $('mapNote').textContent=fmt(townSelected?Math.min(visible.length-unmapped,800):byTown.size)+' map markers · '+fmt(unmapped)+' records without coordinates. '+(state.mode==='zips'?'ZIP markers use a representative collected store address, not ZIP boundaries.':'Select a town or ZIP to see individual mapped addresses.');
  }
  function setMode(mode) {state.mode=mode;state.sort=mode==='winners'?'amount_number':'town';state.descending=mode==='winners';$('winnerMode').classList.toggle('on',mode==='winners');$('retailerMode').classList.toggle('on',mode==='stores');$('status').disabled=mode!=='winners';$('minimum').disabled=mode!=='winners';$('zipMode').classList.toggle('on',mode==='zips');$('archiveMode').classList.toggle('on',mode==='archive');update();}
  $('winnerMode').onclick=()=>setMode('winners');
  $('retailerMode').onclick=()=>setMode('stores');
  $('zipMode').onclick=()=>setMode('zips');$('archiveMode').onclick=()=>setMode('archive');
  for(const id of ['search','town','status','minimum','zip','income']) $(id).addEventListener(id==='search'?'input':'change',update);
  $('head').onclick=event=>{const key=event.target.closest('[data-sort]')?.dataset.sort;if(!key)return;state.descending=state.sort===key?!state.descending:key==='amount_number';state.sort=key;update();};
  $('download').onclick=()=>{
    const fields=[...new Set([...columns[state.mode].map(c=>c[0]),'id','amount','zip_source','income_period','url'])];
    const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const csv=[fields.join(','),...state.visible.map(r=>fields.map(f=>quote(r[f])).join(','))].join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nj-scratchoff-'+state.mode+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  Promise.all(['data/games.json','data/retailers.json','data/coordinates.json','data/address-zips.json','data/income.json','data/archive.json'].map(url=>fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(url+' '+r.status);return r.json();}))).then(([games,retailers,coords,zips,income,archive])=>{
    state.games=games.entries||[];state.stores=retailers.entries||[];state.coordinates=coords;
    state.winners=state.games.flatMap(g=>(g.locations||[]).map(w=>({...w,game:g.name,id:g.id,status:g.status,url:g.url,amount_number:money(w.amount)})));
    state.winners=state.winners.map(r=>ScratchModel.enrich(r,zips,income));
    state.stores=state.stores.map(r=>ScratchModel.enrich(r,zips,income));
    state.archive=(archive.entries||[]).map(r=>ScratchModel.enrich({...r,amount_number:money(r.amount)},zips,income));
    const zipMap=new Map();
    for(const [rows,type] of [[state.winners,'winner_count'],[state.stores,'store_count']]) for(const r of rows){
      if(!r.zip)continue;
      const a=zipMap.get(r.zip)||{...r,towns:[],winner_count:0,store_count:0,xy:null};
      a[type]++;if(!a.towns.includes(norm(r.town)))a.towns.push(norm(r.town));a.xy ||= coords[addressKey(r.address,r.town)];zipMap.set(r.zip,a);
    }
    state.zipRows=[...zipMap.values()].map(r=>({...r,town:r.towns.join(', ')}));
    $('zip').innerHTML='<option value="">All ZIPs</option>'+[...zipMap.keys()].sort().map(z=>'<option>'+z+'</option>').join('');
    $('income').innerHTML='<option value="">All income brackets</option>'+['Under $50,000','$50,000–$74,999','$75,000–$99,999','$100,000–$149,999','$150,000+','Unavailable'].map(b=>'<option>'+b+'</option>').join('');
    $('incomeInfo').textContent='Census ACS '+income.period+' · '+income.dollar_year+' dollars. '+fmt(state.winners.filter(r=>r.zip).length)+' of '+fmt(state.winners.length)+' winning-store records have address-matched ZIPs. '+(archive.coverage_note||'');
    const winCounts=new Map();for(const w of state.winners)winCounts.set(addressKey(w.address,w.town),(winCounts.get(addressKey(w.address,w.town))||0)+1);
    for(const r of state.stores)r.past_wins=winCounts.get(addressKey(r.address,r.town))||0;
    const towns=[...new Set([...state.winners,...state.stores,...state.archive].map(r=>norm(r.town)).filter(Boolean))].sort();
    $('town').innerHTML='<option value="">All towns</option>'+towns.map(t=>'<option value="'+safe(t)+'">'+safe(t)+'</option>').join('');
    $('gameCount').textContent=fmt(state.games.length);$('winCount').textContent=fmt(state.winners.length);$('townCount').textContent=fmt(new Set(state.winners.map(r=>norm(r.town))).size);$('storeCount').textContent=fmt(state.stores.length);
    $('state').textContent='Official-source snapshot: games '+(games.updated_at?.slice(0,10)||'pending')+'; retailer searches '+(retailers.updated_at?.slice(0,10)||'pending')+'. '+(retailers.search_areas?.length||0)+' search areas collected. Game locations have no individual date in the official table.';
    update();
  }).catch(err=>{$('state').textContent='Snapshot unavailable: '+err.message+'. See the official source links below.';});
})();
