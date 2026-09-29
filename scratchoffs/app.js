(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value || '').trim().replace(/\s+/g,' ').toUpperCase();
  const addressKey = (address,town) => norm(address)+'|'+norm(town);
  const money = value => Number(String(value).replace(/[^0-9.]/g,'').match(/\d+(?:\.\d+)?/)?.[0] || 0);
  const fmt = value => new Intl.NumberFormat('en-US').format(value);
  const state = { games:[], winners:[], stores:[], coordinates:{}, mode:'winners', sort:'amount_number', descending:true, visible:[] };
  const map = window.L ? L.map('map', {scrollWheelZoom:false}).setView([40.08,-74.5],8) : null;
  if (map) L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
  let layer = map ? L.layerGroup().addTo(map) : null;
  const columns = {
    winners:[['game','Ticket / game'],['amount_number','Top prize'],['town','Town'],['retailer','Selling store'],['address','Address'],['status','Game status']],
    stores:[['town','Town'],['name','Retailer'],['address','Address'],['zip','ZIP'],['past_wins','Published top-prize sales']]
  };
  function update() {
    const search = norm($('search').value), town = norm($('town').value), status=$('status').value, min=Number($('minimum').value);
    const source = state.mode==='winners'?state.winners:state.stores;
    const visible = source.filter(r => (!town || norm(r.town)===town) &&
      (state.mode==='stores' || ((!status || r.status===status) && r.amount_number>=min)) &&
      (!search || norm([r.game,r.name,r.retailer,r.town,r.address,r.zip].join(' ')).includes(search)));
    const field=state.sort, direction=state.descending?-1:1;
    visible.sort((a,b)=> direction*(typeof a[field]==='number' ? (a[field]||0)-(b[field]||0) : String(a[field]||'').localeCompare(String(b[field]||''))));
    state.visible=visible;
    $('head').innerHTML='<tr>'+columns[state.mode].map(([key,label])=>'<th scope="col" data-sort="'+key+'">'+safe(label)+(field===key?(state.descending?' ↓':' ↑'):'')+'</th>').join('')+'</tr>';
    $('body').innerHTML=visible.slice(0,2000).map(r=> state.mode==='winners' ?
      '<tr><td><a target="_blank" rel="noopener" href="'+safe(r.url)+'">'+safe(r.game)+'</a><small> #'+safe(r.id)+'</small></td><td>'+safe(r.amount)+'</td><td>'+safe(r.town)+'</td><td>'+safe(r.retailer)+(r.closed?' <small>(no longer sells)</small>':'')+'</td><td>'+safe(r.address)+'</td><td>'+safe(r.status)+'</td></tr>' :
      '<tr><td>'+safe(r.town)+'</td><td>'+safe(r.name)+'</td><td>'+safe(r.address)+'</td><td>'+safe(r.zip)+'</td><td>'+fmt(r.past_wins||0)+'</td></tr>').join('');
    $('listTitle').textContent=state.mode==='winners'?'Published top-prize locations':'Current retailer search results';
    $('listInfo').textContent=fmt(visible.length)+' matching rows'+(visible.length>2000?' (first 2,000 shown; download CSV for all)':'');
    $('mapNote').textContent='Mapping '+fmt(visible.length)+' matching records. Addresses that did not match Census geocoding remain in the list.';
    if (!map) { $('mapNote').textContent='Map tiles unavailable. The searchable list and address links remain available.'; return; }
    layer.clearLayers();
    // Town aggregation keeps thousands of retailers usable on a phone. Selecting
    // one town switches to individual store coordinates.
    const byTown=new Map(), townSelected=!!town;
    let unmapped=0;
    for(const r of visible){
      const xy=state.coordinates[addressKey(r.address,r.town)];
      if (!Array.isArray(xy) || xy.length!==2){unmapped++;continue;}
      if(townSelected){
        if(layer.getLayers().length>=800) continue;
        const label=state.mode==='winners'?r.game+' • '+r.amount:r.name;
        L.circleMarker(xy,{radius:7,weight:1,color:state.mode==='winners'?'#bd7415':'#075f67',fillColor:state.mode==='winners'?'#ffd37b':'#62e4d0',fillOpacity:.9})
          .bindPopup('<b>'+safe(label)+'</b><br>'+safe(r.address)+'<br>'+safe(r.town)).addTo(layer);
      } else {
        const k=norm(r.town);
        const entry=byTown.get(k)||{town:r.town,count:0,xy};
        entry.count++;byTown.set(k,entry);
      }
    }
    if(!townSelected) for(const t of byTown.values()) L.circleMarker(t.xy,{radius:Math.min(26,6+Math.sqrt(t.count)*2.4),weight:2,color:state.mode==='winners'?'#a65a15':'#075f67',fillColor:state.mode==='winners'?'#ffd37b':'#62e4d0',fillOpacity:.76}).bindPopup('<b>'+safe(t.town)+'</b><br>'+fmt(t.count)+' mapped '+(state.mode==='winners'?'winner locations':'retailers')+'<br>Select this town in the filter for addresses.').on('click',()=>{ $('town').value=norm(t.town);update(); }).addTo(layer);
    $('mapNote').textContent=fmt(townSelected?Math.min(visible.length-unmapped,800):byTown.size)+' map markers · '+fmt(unmapped)+' records without coordinates. Select a town to see individual mapped addresses.';
  }
  function setMode(mode) {state.mode=mode;state.sort=mode==='winners'?'amount_number':'town';state.descending=mode==='winners';$('winnerMode').classList.toggle('on',mode==='winners');$('retailerMode').classList.toggle('on',mode==='stores');$('status').disabled=mode==='stores';$('minimum').disabled=mode==='stores';update();}
  $('winnerMode').onclick=()=>setMode('winners');
  $('retailerMode').onclick=()=>setMode('stores');
  for(const id of ['search','town','status','minimum']) $(id).addEventListener(id==='search'?'input':'change',update);
  $('head').onclick=event=>{const key=event.target.closest('[data-sort]')?.dataset.sort;if(!key)return;state.descending=state.sort===key?!state.descending:key==='amount_number';state.sort=key;update();};
  $('download').onclick=()=>{
    const fields=state.mode==='winners'?['game','id','amount','town','retailer','address','status','url']:['name','address','town','zip','past_wins'];
    const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const csv=[fields.join(','),...state.visible.map(r=>fields.map(f=>quote(r[f])).join(','))].join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nj-scratchoff-'+state.mode+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  Promise.all(['data/games.json','data/retailers.json','data/coordinates.json'].map(url=>fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(url+' '+r.status);return r.json();}))).then(([games,retailers,coords])=>{
    state.games=games.entries||[];state.stores=retailers.entries||[];state.coordinates=coords;
    state.winners=state.games.flatMap(g=>(g.locations||[]).map(w=>({...w,game:g.name,id:g.id,status:g.status,url:g.url,amount_number:money(w.amount)})));
    const winCounts=new Map();for(const w of state.winners)winCounts.set(addressKey(w.address,w.town),(winCounts.get(addressKey(w.address,w.town))||0)+1);
    for(const r of state.stores)r.past_wins=winCounts.get(addressKey(r.address,r.town))||0;
    const towns=[...new Set([...state.winners,...state.stores].map(r=>norm(r.town)).filter(Boolean))].sort();
    $('town').innerHTML='<option value="">All towns</option>'+towns.map(t=>'<option value="'+safe(t)+'">'+safe(t)+'</option>').join('');
    $('gameCount').textContent=fmt(state.games.length);$('winCount').textContent=fmt(state.winners.length);$('townCount').textContent=fmt(new Set(state.winners.map(r=>norm(r.town))).size);$('storeCount').textContent=fmt(state.stores.length);
    $('state').textContent='Official-source snapshot: games '+(games.updated_at?.slice(0,10)||'pending')+'; retailer searches '+(retailers.updated_at?.slice(0,10)||'pending')+'. '+(retailers.search_areas?.length||0)+' search areas collected. Game locations have no individual date in the official table.';
    update();
  }).catch(err=>{$('state').textContent='Snapshot unavailable: '+err.message+'. See the official source links below.';});
})();
