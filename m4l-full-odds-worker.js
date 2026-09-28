// Exact M4L crowd simulation. Keep aggregate results instead of millions of
// string-keyed tickets, which can exhaust browser memory.
let cumulative, totalWeight, total, completed, draw, drawMB;
let frequency, tiers, examples, secondMB, focusCounts, topWinners;
let focusRows;
let comboCounts;
const COMBO_SIZE = 22910580;
const FOCUS_SIZE = 395010; // 57 choose 4: five main balls include 04
const choose = Array.from({length: 58}, () => Array(6).fill(0));
for (let n = 0; n < choose.length; n++) {
  choose[n][0] = 1;
  for (let k = 1; k <= Math.min(n, 5); k++)
    choose[n][k] = k === n ? 1 : choose[n - 1][k - 1] + choose[n - 1][k];
}

function pick(used) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const random = Math.random() * totalWeight;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < random) lo = mid + 1;
      else hi = mid;
    }
    if (!used[lo + 1]) return lo + 1;
  }
  for (let n = 1; n <= 58; n++) if (!used[n]) return n;
  throw new Error('No unused main ball');
}

function generate() {
  const used = new Uint8Array(59), nums = [];
  const quickPick = Math.random() < 0.15;
  for (let i = 0; i < 5; i++) {
    let n;
    if (quickPick) {
      do { n = 1 + Math.floor(Math.random() * 58); } while (used[n]);
    } else n = pick(used);
    used[n] = 1;
    nums.push(n);
  }
  nums.sort((a, b) => a - b);
  return {nums, mb: 1 + Math.floor(Math.random() * 5)};
}

function focusIndex(nums) {
  let rank = 0, k = 0;
  for (const n of nums) {
    if (n === 4) continue;
    const reduced = n < 4 ? n - 1 : n - 2;
    rank += choose[reduced][++k];
  }
  return rank;
}
function comboIndex(nums, mb) {
  let rank = 0;
  for (let i = 0; i < 5; i++) rank += choose[nums[i] - 1][i + 1];
  return rank * 5 + mb - 1;
}

function score(ticket) {
  const index = comboIndex(ticket.nums, ticket.mb);
  if (comboCounts[index] < 65535) comboCounts[index]++;
  for (const n of ticket.nums) frequency[n]++;
  if (ticket.mb === 4 && ticket.nums.includes(4)) focusCounts[focusIndex(ticket.nums)]++;
  let matched = 0;
  for (const n of ticket.nums) if (draw.includes(n)) matched++;
  const hasMB = ticket.mb === drawMB;
  const tier = matched === 5 ? (hasMB ? 0 : 1) :
    matched === 4 ? (hasMB ? 2 : 3) :
    matched === 3 ? (hasMB ? 4 : 5) :
    matched === 2 ? (hasMB ? 6 : 7) :
    matched === 1 && hasMB ? 8 : -1;
  if (tier >= 0) {
    tiers[tier]++;
    if (!examples[tier]) examples[tier] = ticket;
    if (tier === 1) secondMB[ticket.mb]++;
    if (tier <= 2) {
      const key = ticket.nums.map(n => String(n).padStart(2, '0')).join('-') + ' MB:' + String(ticket.mb).padStart(2, '0');
      topWinners[tier][key] = (topWinners[tier][key] || 0) + 1;
    }
  }
}

function chunk() {
  const end = Math.min(completed + 250000, total);
  for (; completed < end; completed++) score(generate());
  self.postMessage({type: 'progress', done: completed, total});
  if (completed < total) setTimeout(chunk, 0);
  else self.postMessage({type: 'done', margFreqs: Array.from(frequency), tiers,
    examples, secondMB, draw, drawMB, topWinners});
}

function focusPage(page, size) {
  if (!focusRows) {
    focusRows = [];
    // Decode all 4-ball combinations from the compact counter array.
    for (let a = 1; a <= 54; a++) for (let b = a + 1; b <= 55; b++)
      for (let c = b + 1; c <= 56; c++) for (let d = c + 1; d <= 57; d++) {
        const rank = choose[a - 1][1] + choose[b - 1][2] +
          choose[c - 1][3] + choose[d - 1][4];
        const count = focusCounts[rank];
        if (!count) continue;
        const nums = [a,b,c,d].map(n => n < 4 ? n : n + 1);
        nums.push(4);
        nums.sort((x,y) => x-y);
        focusRows.push({key: nums.join(',') + ',4', count});
      }
    focusRows.sort((a,b) => b.count - a.count || a.key.localeCompare(b.key));
  }
  self.postMessage({type: 'focusResult', page, total: focusRows.length,
    rows: focusRows.slice(page * size, (page + 1) * size)});
}

function futureDraws(start, limit) {
  let date = start;
  for (let i = 0; i < limit; i++) {
    const ticket = generateUniformDraw();
    const winners = comboCounts[comboIndex(ticket.nums, ticket.mb)];
    if (winners) {
      self.postMessage({type:'futureHit', date, nights:i + 1, draw:ticket.nums, drawMB:ticket.mb, winners});
      return;
    }
    const next = new Date(date + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0,10);
  }
  self.postMessage({type:'futureMiss', date, nights:limit});
}
function generateUniformDraw() {
  const used = new Set();
  while (used.size < 5) used.add(1 + Math.floor(Math.random() * 58));
  return {nums:Array.from(used).sort((a,b)=>a-b), mb:1 + Math.floor(Math.random()*5)};
}

self.onmessage = ({data}) => {
  if (data.type === 'start') {
    cumulative = data.cum;
    totalWeight = data.totW;
    total = data.total;
    completed = 0;
    draw = data.draw;
    drawMB = data.drawMB;
    frequency = new Uint32Array(59);
    tiers = Array(9).fill(0);
    examples = Array(9).fill(null);
    secondMB = Array(6).fill(0);
    topWinners = [{}, {}, {}];
    focusCounts = new Uint32Array(FOCUS_SIZE);
    comboCounts = new Uint16Array(COMBO_SIZE);
    focusRows = null;
    setTimeout(chunk, 0);
  } else if (data.type === 'focusPage' && completed === total) {
    focusPage(data.page, data.size);
  } else if (data.type === 'futureDraws' && completed === total) {
    futureDraws(data.start, Math.min(10000, data.limit));
  }
};
