/* Weighted virtual crowds. These are assumptions about choices, not ticket-sales data. */
(function(root) {
  'use strict';
  function size(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(1, Math.min(1000000, Math.round(n))) : 100000;
  }
  function probabilities(weights) {
    if (!weights.length || weights.some(w => !Number.isFinite(w) || w < 0)) throw new Error('Invalid crowd weights');
    const total = weights.reduce((a,b) => a+b, 0);
    if (!total) throw new Error('Crowd weights must have positive total');
    return weights.map(w => w/total);
  }
  function expected(weights, count) {
    count = size(count);
    const values = probabilities(weights).map(p => p*count);
    const counts = values.map(Math.floor);
    const order = values.map((v,i) => [i,v-counts[i]]).sort((a,b) => b[1]-a[1] || a[0]-b[0]);
    const remaining = count-counts.reduce((a,b) => a+b,0);
    for(let i=0;i<remaining;i++) counts[order[i][0]]++;
    return counts;
  }
  function random(seed) {
    let s = seed >>> 0;
    return function() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seed() {
    if (root.crypto?.getRandomValues) return root.crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random()*4294967296);
  }
  function sample(weights, count, sampleSeed = seed()) {
    count = size(count);
    const p = probabilities(weights), n = p.length;
    const scaled = p.map(v=>v*n), threshold = new Array(n).fill(1), alias = new Array(n);
    const low = [], high = [];
    scaled.forEach((v,i)=>(v<1 ? low : high).push(i));
    // Alias sampling gives one independent weighted choice per virtual person,
    // including for a million-person crowd, without a million stored tickets.
    while (low.length && high.length) {
      const l=low.pop(), h=high.pop();
      threshold[l]=scaled[l]; alias[l]=h;
      scaled[h] += scaled[l]-1;
      (scaled[h]<1 ? low : high).push(h);
    }
    const rng=random(sampleSeed), counts=new Array(n).fill(0);
    for(let i=0;i<count;i++) {
      const column=Math.floor(rng()*n);
      counts[rng()<threshold[column] ? column : alias[column]]++;
    }
    return counts;
  }
  const api={size, expected, sample, random, seed};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.Pick3Crowd=api;
})(typeof globalThis!=='undefined' ? globalThis : this);
