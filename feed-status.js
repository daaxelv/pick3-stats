(function(root) {
  'use strict';
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function cutoffs(now=new Date(), graceMinutes=0) {
    const parts=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));
    const today=parts.year+'-'+parts.month+'-'+parts.day;
    const yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
    const minute=Number(parts.hour)*60+Number(parts.minute);
    return {MID:minute>=12*60+59+graceMinutes ? today:yesterday, EVE:minute>=22*60+57+graceMinutes ? today:yesterday};
  }
  function missing(history, now=new Date(), days=30, graceMinutes=20) {
    const expected=cutoffs(now,graceMinutes), keys=new Set(history.map(r=>r.date+'_'+r.draw));
    const result={MID:[],EVE:[]};
    for(const draw of ['MID','EVE']) for(let i=days-1;i>=0;i--) {
      const date=new Date(Date.parse(expected[draw]+'T12:00:00Z')-i*86400000).toISOString().slice(0,10);
      if(!keys.has(date+'_'+draw)) result[draw].push(date);
    }
    return {expected, missing:result};
  }
  function assertComplete(previous, incoming) {
    if(!incoming.length) throw new Error('CSV contained no valid Pick 3 results');
    const keys=new Set(incoming.map(r=>r.date+'_'+r.draw));
    if(previous.some(r=>!keys.has(r.date+'_'+r.draw))) throw new Error('Results file is incomplete; keeping the last complete history');
  }
  const api={cutoffs, missing, assertComplete};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.Pick3Feed=api;
})(typeof globalThis!=='undefined' ? globalThis : this);
