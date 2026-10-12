export function unsearchedGaps(gaps, searches) {
  let pending=gaps.map(g=>[g.from_draw,g.to_draw]);
  for(const s of searches){const next=[];for(const [a,b] of pending){if(s.to_draw<a||s.from_draw>b)next.push([a,b]);else {if(a<s.from_draw)next.push([a,s.from_draw-1]);if(b>s.to_draw)next.push([s.to_draw+1,b]);}}pending=next;}
  return pending.map(([from_draw,to_draw])=>({from_draw,to_draw,count:to_draw-from_draw+1}));
}
export function ranges(gaps, limit) {const out=[];for(const g of gaps){for(let first=g.from_draw;first<=g.to_draw&&out.length<limit;first+=500)out.push([first,Math.min(first+499,g.to_draw)]);}return out;}
export function requestMatchesRange(request, first, last) {
  if(!['xhr','fetch'].includes(request.resourceType()))return false;
  const text=decodeURIComponent(request.url()+' '+(request.postData()??''));
  return [first,last].every(n=>new RegExp(`(^|\\D)${n}(\\D|$)`).test(text));
}
