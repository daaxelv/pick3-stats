#!/usr/bin/env node
// patch-fo.js — adds Full-Odds Crowd (22,910,580) to M4L simulator
'use strict';
const fs = require('fs');
const htmlPath = './index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

function assertUnique(src, marker, label) {
  const n = src.split(marker).length - 1;
  if (n !== 1) throw new Error(`Expected 1 match for [${label}], found ${n}`);
}

// Use replacer fn to avoid $ interpretation in replacement strings
function safeReplace(src, anchor, newText) {
  assertUnique(src, anchor, anchor.slice(0, 60));
  return src.replace(anchor, () => newText);
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 1: new Full-Odds global state vars before existing M4L vars
// ─────────────────────────────────────────────────────────────────────────────
const G_ANCHOR = `var _m4lW = null;    // bias weights [index 0 unused; 1-58]`;

const NEW_GLOBALS = `// ── Full-Odds Crowd (22,910,580) state ──────────────────────────────────────
var M4L_FO_TOTAL   = 22910580;
var M4L_FO_FAST_N  = 200000;
var M4L_FO_CHUNK   = 250000;
var _m4lFOWorker   = null;  // active Web Worker or null
var _m4lFOMode     = null;  // "exact" | "fast" | null
var _m4lFOSample   = null;  // Fast-mode ticket array
var _m4lFOMargFreqs = null; // marginal freq array (either mode)
var _m4lFOReady    = false; // true after generation completes
var _m4lFOLookupCb = null;  // pending exact-mode lookup callback
var _m4lFOCCMap    = null;  // combo-count map for fast mode

`;

html = safeReplace(html, G_ANCHOR, NEW_GLOBALS + G_ANCHOR);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 2: new Full-Odds functions before m4lSimCardHTML()
// ─────────────────────────────────────────────────────────────────────────────
const FN_ANCHOR = `function m4lSimCardHTML() {`;

// Worker lines — each will become a single-quoted string element in an array.
// Use double quotes for all string literals inside worker code to avoid
// single-quote escaping issues.
const WORKER_LINES = [
  'var _foCC = {};',
  'var _foCum = null, _foTotW = 0;',
  'var _foMF = null, _foTotal = 0, _foDone = 0;',
  'function _foPick(used) {',
  '  for (var att = 0; att < 50; att++) {',
  '    var r = Math.random() * _foTotW;',
  '    var lo = 0, hi = _foCum.length - 1;',
  '    while (lo < hi) { var mid = (lo+hi)>>1; if (_foCum[mid] < r) lo=mid+1; else hi=mid; }',
  '    var n = lo + 1;',
  '    if (!used[n]) return n;',
  '  }',
  '  for (var k = 1; k <= 58; k++) if (!used[k]) return k;',
  '  return 1;',
  '}',
  'function _foGen() {',
  '  var used = {}, nums = [];',
  '  var qp = Math.random() < 0.15;',
  '  for (var i = 0; i < 5; i++) {',
  '    var n;',
  '    if (qp) { do { n = 1+Math.floor(Math.random()*58); } while (used[n]); }',
  '    else { n = _foPick(used); }',
  '    used[n] = 1; nums.push(n);',
  '  }',
  '  nums.sort(function(a,b){return a-b;});',
  '  return { n0:nums[0], n1:nums[1], n2:nums[2], n3:nums[3], n4:nums[4], mb:1+Math.floor(Math.random()*5) };',
  '}',
  'function _foChunk() {',
  '  var end = Math.min(_foDone + 250000, _foTotal);',
  '  for (var i = _foDone; i < end; i++) {',
  '    var t = _foGen();',
  '    _foMF[t.n0]++; _foMF[t.n1]++; _foMF[t.n2]++; _foMF[t.n3]++; _foMF[t.n4]++;',
  '    var key = t.n0+","+t.n1+","+t.n2+","+t.n3+","+t.n4+","+t.mb;',
  '    _foCC[key] = (_foCC[key] || 0) + 1;',
  '  }',
  '  _foDone = end;',
  '  self.postMessage({ type:"progress", done:_foDone, total:_foTotal });',
  '  if (_foDone < _foTotal) setTimeout(_foChunk, 0);',
  '  else self.postMessage({ type:"done", margFreqs:Array.from(_foMF) });',
  '}',
  'self.onmessage = function(e) {',
  '  var d = e.data;',
  '  if (d.type === "start") {',
  '    _foCum = d.cum; _foTotW = d.totW;',
  '    _foTotal = d.total; _foDone = 0;',
  '    _foCC = {}; _foMF = new Uint32Array(59);',
  '    _foChunk();',
  '  } else if (d.type === "lookup") {',
  '    self.postMessage({ type:"lookupResult", key:d.key, count:_foCC[d.key]||0 });',
  '  }',
  '};',
];

// Build the JS array literal that appears inside _m4lFOWorkerSrc() in index.html.
// Each worker line → a single-quoted string element.  Single quotes inside lines
// are escaped; there are none in the lines above so this is a no-op.
const workerArrayBody = WORKER_LINES
  .map(line => `    '${line.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
  .join(',\n');

const NEW_FUNCTIONS = `
// ═══════════════════════════════════════════════════════════════════════════════
// FULL-ODDS CROWD (22,910,580) — Web Worker + Fast-scaled simulation
// ═══════════════════════════════════════════════════════════════════════════════

function _m4lFOWorkerSrc() {
  // Returns Web Worker source as a string.  All string literals inside use
  // double quotes so there are no escaping conflicts with the outer array.
  return [
${workerArrayBody}
  ].join('\\n');
}

function _m4lFOBallsHtml(nums, mb) {
  var h = '';
  for (var i = 0; i < nums.length; i++) {
    h += '<span style="display:inline-flex;width:36px;height:36px;align-items:center;justify-content:center;' +
      'background:#132434;border:2px solid var(--cyan);border-radius:50%;font-weight:700;font-size:14px;margin:2px;">' +
      nums[i] + '</span> ';
  }
  h += '<span style="display:inline-flex;width:40px;height:40px;align-items:center;justify-content:center;' +
    'background:#1a2e05;border:2px solid var(--gold);border-radius:50%;font-weight:700;font-size:12px;margin:2px 2px 2px 10px;">MB' + mb + '</span>';
  return h;
}

function _m4lFOProfile(nums) {
  var low = 0, high = 0;
  for (var i = 0; i < 5; i++) { if (nums[i] <= 31) low++; else high++; }
  var isSeq3 = false;
  for (var j = 0; j <= 2; j++) {
    if (nums[j+1] === nums[j]+1 && nums[j+2] === nums[j]+2) { isSeq3 = true; break; }
  }
  var allM5 = nums.every(function(n){ return n % 5 === 0; });
  var allM7 = nums.every(function(n){ return n % 7 === 0; });
  return { low: low, high: high, isSeq3: isSeq3, allM5: allM5, allM7: allM7 };
}

function _m4lFOEstHolder(profile) {
  // Profile-based estimate of real-world co-holders.
  // Birthday-range (1-31) numbers attract ~2.2x the crowd vs 32-58 numbers.
  // Average pull across all bias-model combos is ~1.9x.
  var pull = Math.pow(2.2, profile.low);
  var avgPull = 1.9;
  return Math.max(0, Math.round(pull / avgPull));
}

function _m4lFOProfileHtml(nums) {
  var p = _m4lFOProfile(nums);
  var flags = [];
  if (p.isSeq3) flags.push('3 consecutive numbers (popular pattern)');
  if (p.allM5)  flags.push('all multiples of 5 (overplayed)');
  if (p.allM7)  flags.push('all multiples of 7 (overplayed)');
  var flagStr = flags.length
    ? '<span class="warn"> \u2014 ' + flags.join('; ') + '</span>'
    : '<span class="good"> \u2014 no common overplay patterns</span>';
  return '<div class="small" style="margin-top:8px;">' +
    '<strong>Ticket profile:</strong> ' + p.low + ' number' + (p.low === 1 ? '' : 's') +
    ' in 1\u201331 (birthday-biased) + ' + p.high + ' in 32\u201358 (underplayed)' + flagStr +
    '</div>';
}

function _m4lFOShowResult(dNums, dMb, coWin, isExact, t1Count) {
  var el = document.getElementById('m4l-fo-draw-result');
  if (!el) return;
  var ballsH = _m4lFOBallsHtml(dNums, dMb);
  var profH  = _m4lFOProfileHtml(dNums);
  var estH   = '<div class="small" style="margin-top:4px;color:var(--muted);">' +
    'Estimated real-world co-holders for this combination profile: <strong>' +
    _m4lFOEstHolder(_m4lFOProfile(dNums)) + '</strong> (human-bias model, illustrative).</div>';
  var innerH;
  if (coWin > 0) {
    var estLabel = isExact ? '' : ' <span class="small" style="color:var(--muted);">(scaled estimate)</span>';
    innerH =
      '<div class="notice good" style="margin-top:10px;"><strong>\uD83C\uDFC6 Winning Ticket Report</strong></div>' +
      '<div style="margin:10px 0 6px;">' + ballsH + '</div>' +
      '<div class="small" style="margin-top:6px;">' +
        '<strong>Jackpot co-winners in simulated crowd of ' + fmt(M4L_FO_TOTAL) + ':</strong> ' +
        '<strong style="color:var(--green);font-size:18px;">' + fmt(coWin) + '</strong>' + estLabel +
      '</div>' + profH + estH +
      '<div class="small" style="margin-top:6px;color:var(--muted);">' +
        'Life-prize winners are each paid independently \u2014 the prize is NOT split between co-winners.' +
      '</div>';
  } else {
    var t1Str = t1Count > 0
      ? fmt(t1Count) + ' simulated player' + (t1Count === 1 ? '' : 's') +
        ' matched all 5 numbers but not the MB \u2014 second-tier prize ($100K/yr for life).'
      : 'No simulated players matched all 5 numbers either \u2014 an exceptionally rare draw result.';
    innerH =
      '<div class="notice warn" style="margin-top:10px;"><strong>\uD83C\uDFB1 No jackpot winner this drawing</strong></div>' +
      '<div style="margin:10px 0 6px;">' + ballsH + '</div>' +
      '<div class="small" style="margin-top:6px;color:var(--muted);">No simulated player held the exact combination drawn \u2014 the jackpot goes unclaimed.</div>' +
      '<div class="small" style="margin-top:4px;"><strong>Near-misses (5 numbers, wrong MB):</strong> ' + t1Str + '</div>' +
      profH + estH;
  }
  el.innerHTML = innerH;
}

function m4lFODraw() {
  if (!_m4lFOReady) { showToast('Run the Full-Odds simulation first.', '#ff6b6b'); return; }
  var dNums = [], used = {};
  while (dNums.length < 5) {
    var nn = 1 + Math.floor(Math.random() * 58);
    if (!used[nn]) { used[nn] = 1; dNums.push(nn); }
  }
  dNums.sort(function(a, b) { return a - b; });
  var dMb = 1 + Math.floor(Math.random() * 5);

  if (_m4lFOMode === 'exact' && _m4lFOWorker) {
    var jackpotCount = 0, t1Count = 0, received = 0;
    var jackpotKey = dNums[0] + ',' + dNums[1] + ',' + dNums[2] + ',' + dNums[3] + ',' + dNums[4] + ',' + dMb;
    _m4lFOLookupCb = function(d) {
      if (d.key === jackpotKey) jackpotCount = d.count;
      else t1Count += d.count;
      received++;
      if (received === 5) {
        _m4lFOLookupCb = null;
        _m4lFOShowResult(dNums, dMb, jackpotCount, true, t1Count);
      }
    };
    for (var mb = 1; mb <= 5; mb++) {
      _m4lFOWorker.postMessage({
        type: 'lookup',
        key: dNums[0] + ',' + dNums[1] + ',' + dNums[2] + ',' + dNums[3] + ',' + dNums[4] + ',' + mb
      });
    }
  } else {
    // Fast mode: pre-built combo-count map
    var jpKey = dNums[0] + ',' + dNums[1] + ',' + dNums[2] + ',' + dNums[3] + ',' + dNums[4] + ',' + dMb;
    var sJP = (_m4lFOCCMap && _m4lFOCCMap[jpKey]) ? _m4lFOCCMap[jpKey] : 0;
    var sT1 = 0;
    if (_m4lFOCCMap) {
      for (var mb2 = 1; mb2 <= 5; mb2++) {
        if (mb2 !== dMb) {
          var k2 = dNums[0] + ',' + dNums[1] + ',' + dNums[2] + ',' + dNums[3] + ',' + dNums[4] + ',' + mb2;
          sT1 += (_m4lFOCCMap[k2] || 0);
        }
      }
    }
    var sc = M4L_FO_TOTAL / M4L_FO_FAST_N;
    _m4lFOShowResult(dNums, dMb, Math.round(sJP * sc), false, Math.round(sT1 * sc));
  }
}

function m4lFOCancel() {
  if (_m4lFOWorker) { _m4lFOWorker.terminate(); _m4lFOWorker = null; }
  _m4lFOMode = null; _m4lFOReady = false; _m4lFOSample = null;
  _m4lFOMargFreqs = null; _m4lFOLookupCb = null; _m4lFOCCMap = null;
  var els = ['m4l-fo-panel', 'm4l-fo-prog', 'm4l-fo-draw-area', 'm4l-fo-batch-area'];
  els.forEach(function(id) { var e = document.getElementById(id); if (e) e.style.display = 'none'; });
  var distA = document.getElementById('m4l-fo-dist-area');
  if (distA) { distA.style.display = 'none'; distA.innerHTML = ''; }
  var openBtn = document.getElementById('m4l-fo-open-btn');
  if (openBtn) openBtn.style.display = '';
  var res = document.getElementById('m4l-fo-draw-result');
  if (res) res.innerHTML = '';
  var bRes = document.getElementById('m4l-fo-batch-result');
  if (bRes) bRes.innerHTML = '';
}

function _m4lFOOnDone(margFreqs) {
  _m4lFOMargFreqs = margFreqs;
  _m4lFOReady = true;
  var progArea = document.getElementById('m4l-fo-prog');
  if (progArea) progArea.style.display = 'none';
  var distA = document.getElementById('m4l-fo-dist-area');
  if (distA) {
    var label = _m4lFOMode === 'exact'
      ? 'full ' + fmt(M4L_FO_TOTAL) + '-ticket crowd'
      : fmt(M4L_FO_FAST_N) + '-ticket scaled sample';
    var sampleN = _m4lFOMode === 'exact' ? M4L_FO_TOTAL : M4L_FO_FAST_N;
    distA.innerHTML =
      '<div class="sectionTitle" style="font-size:14px;margin-bottom:10px;">Number Popularity \u2014 ' + label + ' vs Uniform 1.72%</div>' +
      _m4lDistChart(margFreqs, sampleN) +
      '<div class="small" style="margin-top:8px;color:var(--muted);">' +
        'Bias model: 85% human-biased (birthday-overweight on 1\u201331), 15% quick-pick. ' +
        'Every real ticket has identical 1\u202Fin\u202F22,910,580 top-prize odds regardless of numbers chosen.' +
      '</div>';
    distA.style.display = 'block';
  }
  var drawA = document.getElementById('m4l-fo-draw-area');
  if (drawA) drawA.style.display = 'block';
  var batchA = document.getElementById('m4l-fo-batch-area');
  if (batchA) batchA.style.display = 'block';
  var startBtn = document.getElementById('m4l-fo-start-btn');
  if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Re-run simulation'; }
  var cancelBtn = document.getElementById('m4l-fo-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function _m4lFOStartFast() {
  _m4lInit();
  var tkts = [], mf = new Array(59).fill(0), cc = {};
  for (var i = 0; i < M4L_FO_FAST_N; i++) {
    var t = _m4lGenTkt(false);
    tkts.push(t);
    for (var j = 0; j < 5; j++) mf[t.nums[j]]++;
    var k = t.nums[0] + ',' + t.nums[1] + ',' + t.nums[2] + ',' + t.nums[3] + ',' + t.nums[4] + ',' + t.mb;
    cc[k] = (cc[k] || 0) + 1;
  }
  _m4lFOSample = tkts;
  _m4lFOCCMap  = cc;
  _m4lFOMode   = 'fast';
  _m4lFOOnDone(mf);
}

function _m4lFOStartExact() {
  _m4lInit();
  var src  = _m4lFOWorkerSrc();
  var blob = new Blob([src], { type: 'application/javascript' });
  var url  = URL.createObjectURL(blob);
  if (_m4lFOWorker) _m4lFOWorker.terminate();
  _m4lFOWorker = new Worker(url);
  URL.revokeObjectURL(url);
  var progBar = document.getElementById('m4l-fo-prog-bar');
  var progTxt = document.getElementById('m4l-fo-prog-txt');
  _m4lFOWorker.onmessage = function(e) {
    var d = e.data;
    if (d.type === 'progress') {
      var pct = Math.round(d.done / d.total * 100);
      if (progBar) progBar.value = d.done;
      if (progTxt) progTxt.textContent = 'Generated ' + fmt(d.done) + ' of ' + fmt(M4L_FO_TOTAL) + ' (' + pct + '%)…';
    } else if (d.type === 'done') {
      _m4lFOMode = 'exact';
      _m4lFOOnDone(d.margFreqs);
    } else if (d.type === 'lookupResult' && _m4lFOLookupCb) {
      _m4lFOLookupCb(d);
    }
  };
  _m4lFOWorker.onerror = function(err) {
    showToast('Worker error: ' + (err.message || 'unknown'), '#ff6b6b');
    m4lFOCancel();
  };
  _m4lFOWorker.postMessage({ type: 'start', total: M4L_FO_TOTAL, cum: _m4lCum, totW: _m4lTotW });
}

function m4lFOStart() {
  _m4lFOReady = false;
  var modeEl = document.querySelector('input[name="m4l-fo-mode"]:checked');
  var mode = modeEl ? modeEl.value : 'fast';
  var startBtn = document.getElementById('m4l-fo-start-btn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Running\u2026'; }
  var distA = document.getElementById('m4l-fo-dist-area');
  if (distA) { distA.style.display = 'none'; distA.innerHTML = ''; }
  var drawA = document.getElementById('m4l-fo-draw-area');
  if (drawA) drawA.style.display = 'none';
  var batchA = document.getElementById('m4l-fo-batch-area');
  if (batchA) batchA.style.display = 'none';
  var res = document.getElementById('m4l-fo-draw-result');
  if (res) res.innerHTML = '';
  var bRes = document.getElementById('m4l-fo-batch-result');
  if (bRes) bRes.innerHTML = '';
  if (mode === 'fast') {
    var progArea = document.getElementById('m4l-fo-prog');
    if (progArea) progArea.style.display = 'none';
    var cancelBtn = document.getElementById('m4l-fo-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    setTimeout(function() { _m4lFOStartFast(); }, 10);
  } else {
    var progArea2 = document.getElementById('m4l-fo-prog');
    if (progArea2) {
      var pb = document.getElementById('m4l-fo-prog-bar');
      if (pb) { pb.max = M4L_FO_TOTAL; pb.value = 0; }
      var pt = document.getElementById('m4l-fo-prog-txt');
      if (pt) pt.textContent = 'Starting Web Worker\u2026';
      progArea2.style.display = 'block';
    }
    var cancelBtn2 = document.getElementById('m4l-fo-cancel-btn');
    if (cancelBtn2) cancelBtn2.style.display = '';
    _m4lFOStartExact();
  }
}

function m4lFullOddsOpen() {
  var panel = document.getElementById('m4l-fo-panel');
  if (panel) panel.style.display = 'block';
  var openBtn = document.getElementById('m4l-fo-open-btn');
  if (openBtn) openBtn.style.display = 'none';
  var isMobile = screen.width < 900 || (navigator.hardwareConcurrency || 4) <= 2;
  var fastRad = document.getElementById('m4l-fo-mode-fast');
  var exRad   = document.getElementById('m4l-fo-mode-exact');
  if (fastRad && exRad) { fastRad.checked = isMobile; exRad.checked = !isMobile; }
}

function m4lFOBatch100() {
  var batchBtn = document.getElementById('m4l-fo-batch-btn');
  if (batchBtn) { batchBtn.disabled = true; batchBtn.textContent = 'Running 100 drawings\u2026'; }
  setTimeout(function() {
    try {
      _m4lInit();
      var cc2 = {};
      for (var i = 0; i < M4L_FO_FAST_N; i++) {
        var t2 = _m4lGenTkt(false);
        var k2 = t2.nums[0] + ',' + t2.nums[1] + ',' + t2.nums[2] + ',' + t2.nums[3] + ',' + t2.nums[4] + ',' + t2.mb;
        cc2[k2] = (cc2[k2] || 0) + 1;
      }
      var SCALE = M4L_FO_TOTAL / M4L_FO_FAST_N;
      var dist = [0, 0, 0, 0];
      var logRows = '';
      for (var dr = 0; dr < 100; dr++) {
        var dn = [], du = {};
        while (dn.length < 5) {
          var nnx = 1 + Math.floor(Math.random() * 58);
          if (!du[nnx]) { du[nnx] = 1; dn.push(nnx); }
        }
        dn.sort(function(a, b) { return a - b; });
        var dmb = 1 + Math.floor(Math.random() * 5);
        var dk = dn[0] + ',' + dn[1] + ',' + dn[2] + ',' + dn[3] + ',' + dn[4] + ',' + dmb;
        var scaledW = Math.round((cc2[dk] || 0) * SCALE);
        var di = scaledW >= 3 ? 3 : scaledW;
        dist[di]++;
        var wStyle = scaledW === 0 ? 'color:var(--muted)' : 'color:var(--green);font-weight:700';
        var numStr = dn.map(function(n) { return ('0' + n).slice(-2); }).join(' ');
        logRows += '<tr><td>' + (dr + 1) + '</td>' +
          '<td class="mono">' + numStr + ' MB' + dmb + '</td>' +
          '<td style="' + wStyle + '">' + scaledW + '</td></tr>';
      }
      var labels = ['0 winners', '1 winner', '2 winners', '3+ winners'];
      var colors = ['#e8854c', '#27d7ff', '#9ee6ff', 'var(--gold)'];
      var maxD = Math.max.apply(null, dist);
      var bars = '';
      for (var bi = 0; bi < 4; bi++) {
        var bh = maxD ? Math.max(4, Math.round((dist[bi] / maxD) * 80)) : 4;
        bars += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">' +
          '<div style="font-weight:700;font-size:16px;color:' + colors[bi] + ';">' + dist[bi] + '</div>' +
          '<div style="width:48px;height:' + bh + 'px;background:' + colors[bi] + ';border-radius:4px 4px 0 0;"></div>' +
          '<div class="small" style="text-align:center;line-height:1.3;">' + labels[bi] + '</div>' +
          '</div>';
      }
      var chartH = '<div style="display:flex;align-items:flex-end;gap:12px;margin:12px 0;padding:14px;background:var(--panel2);border-radius:12px;">' + bars + '</div>';
      var noWinPct = dist[0];
      var batchRes = document.getElementById('m4l-fo-batch-result');
      if (batchRes) {
        batchRes.innerHTML =
          '<div class="notice" style="margin-bottom:12px;">' +
            'Out of 100 simulated drawings against a ' + fmt(M4L_FO_TOTAL) + '-ticket crowd: ' +
            '<strong style="color:var(--gold);">' + noWinPct + ' had no jackpot winner</strong>' +
            ' \u00a0|\u00a0 ' + dist[1] + ' had 1 winner' +
            ' \u00a0|\u00a0 ' + dist[2] + ' had 2 winners' +
            ' \u00a0|\u00a0 ' + dist[3] + ' had 3 or more winners.' +
          '</div>' +
          chartH +
          '<div style="max-height:280px;overflow-y:auto;margin-top:8px;">' +
            '<table><thead><tr><th>#</th><th>Numbers Drawn</th><th>Jackpot winners (est.)</th></tr></thead>' +
            '<tbody>' + logRows + '</tbody></table>' +
          '</div>';
      }
    } finally {
      if (batchBtn) { batchBtn.disabled = false; batchBtn.textContent = '\uD83D\uDD01 Run 100 drawings again'; }
    }
  }, 10);
}

`;

html = safeReplace(html, FN_ANCHOR, NEW_FUNCTIONS + FN_ANCHOR);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH 3: add Full Odds HTML section inside m4lSimCardHTML() return value
// ─────────────────────────────────────────────────────────────────────────────
const HTML_ANCHOR =
`      '<div id="m4l-tickets-result" style="margin-top:12px;"></div>' +\n    '</div>' +\n\n  '</div>';`;

const FO_HTML_SECTION =
`      '<div id="m4l-tickets-result" style="margin-top:12px;"></div>' +
    '</div>' +

    // ── Full-Odds Crowd section ──────────────────────────────────────────────
    '<div style="margin-top:22px;padding-top:20px;border-top:2px solid var(--cyan);">' +
      '<div class="sectionTitle" style="font-size:15px;">\uD83C\uDF10 Full-Odds Crowd \u2014 22,910,580 Tickets</div>' +
      '<div class="notice" style="margin-top:10px;font-size:12px;">' +
        'Even when every one of the 22,910,580 possible ticket slots is filled by a simulated player, ' +
        'prize-sharing and the birthday-paradox dynamic mean that <strong>~37% of drawings still crown ' +
        'no jackpot winner</strong> \u2014 because players cluster on popular combinations while leaving ' +
        'others unplayed. Every real ticket always has exactly <strong>1\u202Fin\u202F22,910,580</strong> top-prize ' +
        'odds regardless of what anyone else picks. Results are illustrative.' +
      '</div>' +
      '<div style="margin-top:12px;">' +
        '<button id="m4l-fo-open-btn" class="secondary" onclick="m4lFullOddsOpen()" ' +
          'style="min-height:44px;background:linear-gradient(135deg,#0a2540,#1a4a70);' +
          'border:2px solid var(--cyan);font-weight:700;font-size:13px;">' +
          '\uD83C\uDF10 FULL ODDS CROWD \u2014 22,910,580' +
        '</button>' +
      '</div>' +

      '<div id="m4l-fo-panel" style="display:none;margin-top:14px;padding:14px;background:var(--panel2);border-radius:12px;border:1px solid var(--line);">' +
        '<div class="sectionTitle" style="font-size:13px;">Choose simulation mode</div>' +
        '<div style="margin-top:10px;display:flex;flex-direction:column;gap:10px;">' +
          '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;">' +
            '<input type="radio" id="m4l-fo-mode-fast" name="m4l-fo-mode" value="fast" checked style="margin-top:3px;">' +
            '<span><strong>Fast (scaled)</strong> \u2014 200,000-ticket biased sample scaled to 22,910,580. Runs in &lt;1\u202Fs. Auto-selected on mobile / low-core devices.</span>' +
          '</label>' +
          '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;">' +
            '<input type="radio" id="m4l-fo-mode-exact" name="m4l-fo-mode" value="exact" style="margin-top:3px;">' +
            '<span><strong>Exact</strong> \u2014 Web Worker generates all 22,910,580 tickets in ~250K chunks. Co-winner counts are precise. ~30\u201390\u202Fs on desktop. <em>Not recommended on mobile.</em></span>' +
          '</label>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">' +
          '<button id="m4l-fo-start-btn" class="primary" onclick="m4lFOStart()" style="min-height:44px;">\u25B6 Start simulation</button>' +
          '<button id="m4l-fo-cancel-btn" class="secondary" onclick="m4lFOCancel()" style="min-height:44px;display:none;">\u2716 Cancel</button>' +
        '</div>' +

        '<div id="m4l-fo-prog" style="display:none;margin-top:14px;">' +
          '<progress id="m4l-fo-prog-bar" max="22910580" value="0" style="width:100%;height:14px;"></progress>' +
          '<div id="m4l-fo-prog-txt" class="small" style="margin-top:6px;color:var(--muted);">Starting\u2026</div>' +
        '</div>' +

        '<div id="m4l-fo-dist-area" style="display:none;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);"></div>' +

        '<div id="m4l-fo-draw-area" style="display:none;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);">' +
          '<div class="sectionTitle" style="font-size:14px;">Mock Drawing \u2014 Full-Odds Crowd</div>' +
          '<div class="small" style="margin-bottom:10px;color:var(--muted);">Picks a random 5\u202F+\u202FMB combination and shows how many of the 22.9M simulated tickets hold it. Run multiple times for different outcomes.</div>' +
          '<button class="secondary" onclick="m4lFODraw()" style="min-height:44px;">\uD83C\uDFB1 Draw numbers</button>' +
          '<div id="m4l-fo-draw-result" style="margin-top:12px;"></div>' +
        '</div>' +

        '<div id="m4l-fo-batch-area" style="display:none;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);">' +
          '<div class="sectionTitle" style="font-size:14px;">100-Drawing Batch \u2014 Fast Mode</div>' +
          '<div class="small" style="margin-bottom:10px;color:var(--muted);">Generates a fresh 200K-ticket sample, runs 100 independent random draws, and charts how often there is no jackpot winner (scaled to 22.9M crowd).</div>' +
          '<button id="m4l-fo-batch-btn" class="secondary" onclick="m4lFOBatch100()" style="min-height:44px;">\uD83D\uDD01 Run 100 drawings</button>' +
          '<div id="m4l-fo-batch-result" style="margin-top:12px;"></div>' +
        '</div>' +

      '</div>' +

    '</div>' +

  '</div>';`;

html = safeReplace(html, HTML_ANCHOR, FO_HTML_SECTION);

// ─────────────────────────────────────────────────────────────────────────────
// Integrity checks
// ─────────────────────────────────────────────────────────────────────────────
const closeCount = (html.match(/<\/html>/g) || []).length;
if (closeCount !== 1) throw new Error(`Expected 1 </html>, found ${closeCount}`);

const scriptStart = html.indexOf('<script>');
const scriptEnd   = html.lastIndexOf('</script>');
if (scriptStart === -1 || scriptEnd === -1) throw new Error('Cannot find <script> tags');
try { new Function(html.slice(scriptStart + 8, scriptEnd)); }
catch (e) { throw new Error('Syntax error in patched <script>: ' + e.message); }

fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`patch-fo: applied OK — ${html.split('\n').length} lines`);
