#!/usr/bin/env node
// patch-fo.js — adds Full-Odds Crowd (22,910,580) to M4L Virtual Crowd Simulator
'use strict';
const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

function assertUnique(src, marker, label) {
  const n = src.split(marker).length - 1;
  if (n !== 1) throw new Error('Expected 1 match for [' + label + '], found ' + n);
}

// ────────────────────────────────────────────────────────────────────────────
// PATCH 1 — new Full-Odds global state vars, inserted before existing M4L vars
// ────────────────────────────────────────────────────────────────────────────
const G_ANCHOR = 'var _m4lW = null;    // bias weights [index 0 unused; 1-58]';
assertUnique(html, G_ANCHOR, 'globals anchor');

const NEW_GLOBALS =
'// ── Full-Odds Crowd (22,910,580) state ───────────────────────────────────\n' +
'var M4L_FO_TOTAL   = 22910580;\n' +
'var M4L_FO_FAST_N  = 200000;\n' +
'var M4L_FO_CHUNK   = 250000;\n' +
'var _m4lFOWorker   = null;  // active Web Worker or null\n' +
'var _m4lFOMode     = null;  // "exact" | "fast" | null\n' +
'var _m4lFOSample   = null;  // 200K ticket array (fast mode)\n' +
'var _m4lFOMargFreqs = null; // marginal freq array (either mode)\n' +
'var _m4lFOReady    = false; // true after generation complete\n' +
'var _m4lFOLookupCb = null;  // pending exact-mode lookup callback\n' +
'var _m4lFOCCMap    = null;  // combo-count map for fast mode\n' +
'\n';

html = html.replace(G_ANCHOR, NEW_GLOBALS + G_ANCHOR);
assertUnique(html, G_ANCHOR, 'globals anchor after patch 1');

// ────────────────────────────────────────────────────────────────────────────
// PATCH 2 — new Full-Odds functions, inserted before m4lSimCardHTML()
// ────────────────────────────────────────────────────────────────────────────
const FN_ANCHOR = 'function m4lSimCardHTML() {';
assertUnique(html, FN_ANCHOR, 'fn anchor');

// Worker source lines.  Each element is one line of Worker JS code.
// We use double-quoted strings inside the worker lines so they can be safely
// embedded in single-quoted browser-JS strings without escaping issues.
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

// Build the worker source string as it will appear inside index.html JS.
// Each worker line becomes a single-quoted string element in an array literal.
// We must escape any backslashes first (there are none here) and avoid embedded single quotes.
const WORKER_ARRAY_LITERAL = WORKER_LINES
  .map(function(line) {
    // Escape backslashes, then single quotes (none expected, but be safe)
    return "'" + line.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  })
  .join(',\n    ');

// NEW_FUNCTIONS is the block of code that will be inserted into index.html.
// Must NOT contain template literals (backticks) — string concatenation only.
const NEW_FUNCTIONS =
'\n// ═══════════════════════════════════════════════════════════════════════════\n' +
'// FULL-ODDS CROWD (22,910,580) — functions\n' +
'// ═══════════════════════════════════════════════════════════════════════════\n' +
'\n' +
'function _m4lFOWorkerSrc() {\n' +
'  return [\n' +
'    ' + WORKER_ARRAY_LITERAL + '\n' +
'  ].join("\\n");\n' +
'}\n' +
'\n' +
'function _m4lFOBallsHtml(nums, mb) {\n' +
'  var h = "";\n' +
'  for (var i = 0; i < nums.length; i++) {\n' +
'    h += \'<span style="display:inline-flex;width:36px;height:36px;align-items:center;justify-content:center;\' +\n' +
'      \'background:#132434;border:2px solid var(--cyan);border-radius:50%;font-weight:700;font-size:14px;margin:2px;">\' +\n' +
'      nums[i] + \'</span> \';\n' +
'  }\n' +
'  h += \'<span style="display:inline-flex;width:40px;height:40px;align-items:center;justify-content:center;\' +\n' +
'    \'background:#1a2e05;border:2px solid var(--gold);border-radius:50%;font-weight:700;font-size:12px;margin:2px 2px 2px 10px;">MB\' + mb + \'</span>\';\n' +
'  return h;\n' +
'}\n' +
'\n' +
'function _m4lFOProfile(nums) {\n' +
'  var low = 0, high = 0;\n' +
'  for (var i = 0; i < 5; i++) { if (nums[i] <= 31) low++; else high++; }\n' +
'  var isSeq3 = false;\n' +
'  for (var j = 0; j <= 2; j++) {\n' +
'    if (nums[j+1] === nums[j]+1 && nums[j+2] === nums[j]+2) { isSeq3 = true; break; }\n' +
'  }\n' +
'  var allM5 = nums.every(function(n){return n%5===0;});\n' +
'  var allM7 = nums.every(function(n){return n%7===0;});\n' +
'  return { low:low, high:high, isSeq3:isSeq3, allM5:allM5, allM7:allM7 };\n' +
'}\n' +
'\n' +
'function _m4lFOEstHolder(profile) {\n' +
'  // Profile-based crowd-pull estimate: 1-31 numbers attract ~2.2x vs 32-58.\n' +
'  // Average pull across all biased combos is ~1.9x. Result is illustrative.\n' +
'  var pull = Math.pow(2.2, profile.low);\n' +
'  var avgPull = 1.9;\n' +
'  var relFreq = pull / avgPull;\n' +
'  return Math.max(0, Math.round(relFreq));\n' +
'}\n' +
'\n' +
'function _m4lFOProfileHtml(nums) {\n' +
'  var p = _m4lFOProfile(nums);\n' +
'  var flags = [];\n' +
'  if (p.isSeq3) flags.push("3 consecutive numbers (popular pattern)");\n' +
'  if (p.allM5)  flags.push("all multiples of 5 (overplayed)");\n' +
'  if (p.allM7)  flags.push("all multiples of 7 (overplayed)");\n' +
'  var flagStr = flags.length\n' +
'    ? \'<span class="warn"> — \' + flags.join("; ") + \'</span>\'\n' +
'    : \'<span class="good"> — no common overplay patterns</span>\';\n' +
'  return \'<div class="small" style="margin-top:8px;">\' +\n' +
'    \'<strong>Ticket profile:</strong> \' + p.low + \' number\' + (p.low===1?"":"s") + \' in 1–31 (birthday-biased) + \' +\n' +
'    p.high + \' in 32–58 (underplayed)\' + flagStr +\n' +
'    \'</div>\';\n' +
'}\n' +
'\n' +
'function _m4lFOShowResult(dNums, dMb, coWin, isExact, t1Count) {\n' +
'  var el = document.getElementById("m4l-fo-draw-result");\n' +
'  if (!el) return;\n' +
'  var ballsH = _m4lFOBallsHtml(dNums, dMb);\n' +
'  var profH  = _m4lFOProfileHtml(dNums);\n' +
'  var estH   = \'<div class="small" style="margin-top:4px;color:var(--muted);">\' +\n' +
'    \'Estimated real-world co-holders for this combination profile: <strong>\' +\n' +
'    _m4lFOEstHolder(_m4lFOProfile(dNums)) + \'</strong> (human-bias model, illustrative).</div>\';\n' +
'  var innerH;\n' +
'  if (coWin > 0) {\n' +
'    var estLabel = isExact ? "" : " (scaled estimate)";\n' +
'    innerH =\n' +
'      \'<div class="notice good" style="margin-top:10px;"><strong>🏆 Winning Ticket Report</strong></div>\' +\n' +
'      \'<div style="margin:10px 0 6px;">\' + ballsH + \'</div>\' +\n' +
'      \'<div class="small" style="margin-top:6px;">\' +\n' +
'        \'<strong>Jackpot co-winners in this simulated crowd of \' + fmt(M4L_FO_TOTAL) + \':</strong> \' +\n' +
'        \'<strong style="color:var(--green);font-size:18px;">\' + fmt(coWin) + \'</strong>\' + estLabel +\n' +
'      \'</div>\' + profH + estH +\n' +
'      \'<div class="small" style="margin-top:6px;color:var(--muted);">\' +\n' +
'        \'Life-prize winners are each paid independently — the prize is NOT split between co-winners.\' +\n' +
'      \'</div>\';\n' +
'  } else {\n' +
'    var t1Str = t1Count > 0\n' +
'      ? fmt(t1Count) + \' simulated player\' + (t1Count===1?"":"s") + \' matched all 5 numbers but not the MB — second-tier prize ($100K/yr for life).\'\n' +
'      : "No simulated players matched all 5 numbers either — an exceptionally rare result.";\n' +
'    innerH =\n' +
'      \'<div class="notice warn" style="margin-top:10px;"><strong>🎱 No jackpot winner this drawing</strong></div>\' +\n' +
'      \'<div style="margin:10px 0 6px;">\' + ballsH + \'</div>\' +\n' +
'      \'<div class="small" style="margin-top:6px;color:var(--muted);">No simulated player held the exact combination drawn — the jackpot goes unclaimed this drawing.</div>\' +\n' +
'      \'<div class="small" style="margin-top:4px;"><strong>Near-misses (5 numbers, wrong MB):</strong> \' + t1Str + \'</div>\' +\n' +
'      profH + estH;\n' +
'  }\n' +
'  el.innerHTML = innerH;\n' +
'}\n' +
'\n' +
'function m4lFODraw() {\n' +
'  if (!_m4lFOReady) { showToast("Run the Full-Odds simulation first.", "#ff6b6b"); return; }\n' +
'  var dNums = [], used = {};\n' +
'  while (dNums.length < 5) { var nn = 1+Math.floor(Math.random()*58); if (!used[nn]) { used[nn]=1; dNums.push(nn); } }\n' +
'  dNums.sort(function(a,b){return a-b;});\n' +
'  var dMb = 1+Math.floor(Math.random()*5);\n' +
'  if (_m4lFOMode === "exact" && _m4lFOWorker) {\n' +
'    // Ask worker for counts for all 5 MB values (to get tier-1 near-misses too)\n' +
'    var jackpotCount = 0, t1Count = 0, received = 0;\n' +
'    var jackpotKey = dNums[0]+","+dNums[1]+","+dNums[2]+","+dNums[3]+","+dNums[4]+","+dMb;\n' +
'    _m4lFOLookupCb = function(d) {\n' +
'      if (d.key === jackpotKey) jackpotCount = d.count;\n' +
'      else t1Count += d.count;\n' +
'      received++;\n' +
'      if (received === 5) {\n' +
'        _m4lFOLookupCb = null;\n' +
'        _m4lFOShowResult(dNums, dMb, jackpotCount, true, t1Count);\n' +
'      }\n' +
'    };\n' +
'    for (var mb = 1; mb <= 5; mb++) {\n' +
'      _m4lFOWorker.postMessage({ type:"lookup", key:dNums[0]+","+dNums[1]+","+dNums[2]+","+dNums[3]+","+dNums[4]+","+mb });\n' +
'    }\n' +
'  } else {\n' +
'    // Fast mode: use pre-built combo-count map\n' +
'    var jpKey = dNums[0]+","+dNums[1]+","+dNums[2]+","+dNums[3]+","+dNums[4]+","+dMb;\n' +
'    var sJP = _m4lFOCCMap[jpKey] || 0;\n' +
'    var sT1 = 0;\n' +
'    for (var mb2 = 1; mb2 <= 5; mb2++) {\n' +
'      if (mb2 !== dMb) sT1 += (_m4lFOCCMap[dNums[0]+","+dNums[1]+","+dNums[2]+","+dNums[3]+","+dNums[4]+","+mb2] || 0);\n' +
'    }\n' +
'    var sc = M4L_FO_TOTAL / M4L_FO_FAST_N;\n' +
'    _m4lFOShowResult(dNums, dMb, Math.round(sJP*sc), false, Math.round(sT1*sc));\n' +
'  }\n' +
'}\n' +
'\n' +
'function m4lFOCancel() {\n' +
'  if (_m4lFOWorker) { _m4lFOWorker.terminate(); _m4lFOWorker = null; }\n' +
'  _m4lFOMode = null; _m4lFOReady = false; _m4lFOSample = null;\n' +
'  _m4lFOMargFreqs = null; _m4lFOLookupCb = null; _m4lFOCCMap = null;\n' +
'  var panel = document.getElementById("m4l-fo-panel");\n' +
'  if (panel) panel.style.display = "none";\n' +
'  var openBtn = document.getElementById("m4l-fo-open-btn");\n' +
'  if (openBtn) openBtn.style.display = "";\n' +
'  var progArea = document.getElementById("m4l-fo-prog");\n' +
'  if (progArea) progArea.style.display = "none";\n' +
'  var drawA = document.getElementById("m4l-fo-draw-area");\n' +
'  if (drawA) drawA.style.display = "none";\n' +
'  var batchA = document.getElementById("m4l-fo-batch-area");\n' +
'  if (batchA) batchA.style.display = "none";\n' +
'  var distA = document.getElementById("m4l-fo-dist-area");\n' +
'  if (distA) { distA.style.display = "none"; distA.innerHTML = ""; }\n' +
'  var res = document.getElementById("m4l-fo-draw-result");\n' +
'  if (res) res.innerHTML = "";\n' +
'  var bRes = document.getElementById("m4l-fo-batch-result");\n' +
'  if (bRes) bRes.innerHTML = "";\n' +
'}\n' +
'\n' +
'function _m4lFOOnDone(margFreqs) {\n' +
'  _m4lFOMargFreqs = margFreqs;\n' +
'  _m4lFOReady = true;\n' +
'  var progArea = document.getElementById("m4l-fo-prog");\n' +
'  if (progArea) progArea.style.display = "none";\n' +
'  var distA = document.getElementById("m4l-fo-dist-area");\n' +
'  if (distA) {\n' +
'    var label = _m4lFOMode === "exact"\n' +
'      ? "full " + fmt(M4L_FO_TOTAL) + "-ticket crowd"\n' +
'      : fmt(M4L_FO_FAST_N) + "-ticket scaled sample";\n' +
'    var sampleN = _m4lFOMode === "exact" ? M4L_FO_TOTAL : M4L_FO_FAST_N;\n' +
'    distA.innerHTML =\n' +
'      \'<div class="sectionTitle" style="font-size:14px;margin-bottom:10px;">Number Popularity — \' + label + \' vs Uniform 1.72%</div>\' +\n' +
'      _m4lDistChart(margFreqs, sampleN) +\n' +
'      \'<div class="small" style="margin-top:8px;color:var(--muted);">Bias model: 85% human-biased (birthday-overweight on 1–31), 15% quick-pick. Every real ticket has identical 1 in 22,910,580 top-prize odds regardless of numbers chosen.</div>\';\n' +
'    distA.style.display = "block";\n' +
'  }\n' +
'  var drawA = document.getElementById("m4l-fo-draw-area");\n' +
'  if (drawA) drawA.style.display = "block";\n' +
'  var batchA = document.getElementById("m4l-fo-batch-area");\n' +
'  if (batchA) batchA.style.display = "block";\n' +
'  var startBtn = document.getElementById("m4l-fo-start-btn");\n' +
'  if (startBtn) { startBtn.disabled = false; startBtn.textContent = "Re-run simulation"; }\n' +
'  var cancelBtn = document.getElementById("m4l-fo-cancel-btn");\n' +
'  if (cancelBtn) cancelBtn.style.display = "none";\n' +
'}\n' +
'\n' +
'function _m4lFOStartFast() {\n' +
'  _m4lInit();\n' +
'  var tkts = [], mf = new Array(59).fill(0), cc = {};\n' +
'  for (var i = 0; i < M4L_FO_FAST_N; i++) {\n' +
'    var t = _m4lGenTkt(false);\n' +
'    tkts.push(t);\n' +
'    for (var j = 0; j < 5; j++) mf[t.nums[j]]++;\n' +
'    var k = t.nums[0]+","+t.nums[1]+","+t.nums[2]+","+t.nums[3]+","+t.nums[4]+","+t.mb;\n' +
'    cc[k] = (cc[k] || 0) + 1;\n' +
'  }\n' +
'  _m4lFOSample = tkts;\n' +
'  _m4lFOCCMap = cc;\n' +
'  _m4lFOMode = "fast";\n' +
'  _m4lFOOnDone(mf);\n' +
'}\n' +
'\n' +
'function _m4lFOStartExact() {\n' +
'  _m4lInit();\n' +
'  var src = _m4lFOWorkerSrc();\n' +
'  var blob = new Blob([src], { type:"application/javascript" });\n' +
'  var url = URL.createObjectURL(blob);\n' +
'  if (_m4lFOWorker) _m4lFOWorker.terminate();\n' +
'  _m4lFOWorker = new Worker(url);\n' +
'  URL.revokeObjectURL(url);\n' +
'  var progBar = document.getElementById("m4l-fo-prog-bar");\n' +
'  var progTxt = document.getElementById("m4l-fo-prog-txt");\n' +
'  _m4lFOWorker.onmessage = function(e) {\n' +
'    var d = e.data;\n' +
'    if (d.type === "progress") {\n' +
'      var pct = Math.round(d.done / d.total * 100);\n' +
'      if (progBar) progBar.value = d.done;\n' +
'      if (progTxt) progTxt.textContent = "Generated " + fmt(d.done) + " of " + fmt(M4L_FO_TOTAL) + " (" + pct + "%)…";\n' +
'    } else if (d.type === "done") {\n' +
'      _m4lFOMode = "exact";\n' +
'      _m4lFOOnDone(d.margFreqs);\n' +
'    } else if (d.type === "lookupResult" && _m4lFOLookupCb) {\n' +
'      _m4lFOLookupCb(d);\n' +
'    }\n' +
'  };\n' +
'  _m4lFOWorker.onerror = function(err) {\n' +
'    showToast("Worker error: " + (err.message || "unknown"), "#ff6b6b");\n' +
'    m4lFOCancel();\n' +
'  };\n' +
'  _m4lFOWorker.postMessage({ type:"start", total:M4L_FO_TOTAL, cum:_m4lCum, totW:_m4lTotW });\n' +
'}\n' +
'\n' +
'function m4lFOStart() {\n' +
'  _m4lFOReady = false;\n' +
'  var modeEl = document.querySelector("input[name=\\"m4l-fo-mode\\"]:checked");\n' +
'  var mode = modeEl ? modeEl.value : "fast";\n' +
'  var startBtn = document.getElementById("m4l-fo-start-btn");\n' +
'  if (startBtn) { startBtn.disabled = true; startBtn.textContent = "Running…"; }\n' +
'  // Clear previous results\n' +
'  var distA = document.getElementById("m4l-fo-dist-area");\n' +
'  if (distA) { distA.style.display = "none"; distA.innerHTML = ""; }\n' +
'  var drawA = document.getElementById("m4l-fo-draw-area");\n' +
'  if (drawA) drawA.style.display = "none";\n' +
'  var batchA = document.getElementById("m4l-fo-batch-area");\n' +
'  if (batchA) batchA.style.display = "none";\n' +
'  var res = document.getElementById("m4l-fo-draw-result");\n' +
'  if (res) res.innerHTML = "";\n' +
'  var bRes = document.getElementById("m4l-fo-batch-result");\n' +
'  if (bRes) bRes.innerHTML = "";\n' +
'  if (mode === "fast") {\n' +
'    var progArea = document.getElementById("m4l-fo-prog");\n' +
'    if (progArea) progArea.style.display = "none";\n' +
'    var cancelBtn = document.getElementById("m4l-fo-cancel-btn");\n' +
'    if (cancelBtn) cancelBtn.style.display = "none";\n' +
'    setTimeout(function() { _m4lFOStartFast(); }, 10);\n' +
'  } else {\n' +
'    var progArea2 = document.getElementById("m4l-fo-prog");\n' +
'    if (progArea2) {\n' +
'      var pb = document.getElementById("m4l-fo-prog-bar");\n' +
'      if (pb) { pb.max = M4L_FO_TOTAL; pb.value = 0; }\n' +
'      var pt = document.getElementById("m4l-fo-prog-txt");\n' +
'      if (pt) pt.textContent = "Starting Web Worker…";\n' +
'      progArea2.style.display = "block";\n' +
'    }\n' +
'    var cancelBtn2 = document.getElementById("m4l-fo-cancel-btn");\n' +
'    if (cancelBtn2) cancelBtn2.style.display = "";\n' +
'    _m4lFOStartExact();\n' +
'  }\n' +
'}\n' +
'\n' +
'function m4lFullOddsOpen() {\n' +
'  var panel = document.getElementById("m4l-fo-panel");\n' +
'  if (panel) panel.style.display = "block";\n' +
'  var openBtn = document.getElementById("m4l-fo-open-btn");\n' +
'  if (openBtn) openBtn.style.display = "none";\n' +
'  // Auto-select mode based on device\n' +
'  var isMobile = screen.width < 900 || (navigator.hardwareConcurrency || 4) <= 2;\n' +
'  var fastRad = document.getElementById("m4l-fo-mode-fast");\n' +
'  var exRad   = document.getElementById("m4l-fo-mode-exact");\n' +
'  if (fastRad && exRad) { fastRad.checked = isMobile; exRad.checked = !isMobile; }\n' +
'}\n' +
'\n' +
'function m4lFOBatch100() {\n' +
'  var batchBtn = document.getElementById("m4l-fo-batch-btn");\n' +
'  if (batchBtn) { batchBtn.disabled = true; batchBtn.textContent = "Running 100 drawings…"; }\n' +
'  setTimeout(function() {\n' +
'    try {\n' +
'      _m4lInit();\n' +
'      // Generate fresh 200K sample and build combo-count map\n' +
'      var cc2 = {};\n' +
'      for (var i = 0; i < M4L_FO_FAST_N; i++) {\n' +
'        var t2 = _m4lGenTkt(false);\n' +
'        var k2 = t2.nums[0]+","+t2.nums[1]+","+t2.nums[2]+","+t2.nums[3]+","+t2.nums[4]+","+t2.mb;\n' +
'        cc2[k2] = (cc2[k2] || 0) + 1;\n' +
'      }\n' +
'      var SCALE = M4L_FO_TOTAL / M4L_FO_FAST_N;\n' +
'      var dist = [0, 0, 0, 0]; // 0, 1, 2, 3+ winners\n' +
'      var logRows = "";\n' +
'      for (var dr = 0; dr < 100; dr++) {\n' +
'        var dn = [], du = {};\n' +
'        while (dn.length < 5) { var nnx = 1+Math.floor(Math.random()*58); if (!du[nnx]) { du[nnx]=1; dn.push(nnx); } }\n' +
'        dn.sort(function(a,b){return a-b;});\n' +
'        var dmb = 1+Math.floor(Math.random()*5);\n' +
'        var dk = dn[0]+","+dn[1]+","+dn[2]+","+dn[3]+","+dn[4]+","+dmb;\n' +
'        var scaledW = Math.round((cc2[dk] || 0) * SCALE);\n' +
'        var di = scaledW >= 3 ? 3 : scaledW;\n' +
'        dist[di]++;\n' +
'        var wStyle = scaledW === 0 ? "color:var(--muted)" : "color:var(--green);font-weight:700";\n' +
'        var numStr = dn.map(function(n){return ("0"+n).slice(-2);}).join(" ");\n' +
'        logRows += "<tr><td>" + (dr+1) + "</td><td class=\\"mono\\">" + numStr + " MB" + dmb + "</td>" +\n' +
'          "<td style=\\"" + wStyle + "\\">" + scaledW + "</td></tr>";\n' +
'      }\n' +
'      var labels = ["0 winners", "1 winner", "2 winners", "3+ winners"];\n' +
'      var colors = ["#e8854c", "#27d7ff", "#9ee6ff", "var(--gold)"];\n' +
'      var maxD = Math.max.apply(null, dist);\n' +
'      var bars = "";\n' +
'      for (var bi = 0; bi < 4; bi++) {\n' +
'        var bh = maxD ? Math.max(4, Math.round((dist[bi]/maxD)*80)) : 4;\n' +
'        bars += \'<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">\' +\n' +
'          \'<div style="font-weight:700;font-size:16px;color:\' + colors[bi] + \'">\' + dist[bi] + \'</div>\' +\n' +
'          \'<div style="width:48px;height:\' + bh + \'px;background:\' + colors[bi] + \';border-radius:4px 4px 0 0;"></div>\' +\n' +
'          \'<div class="small" style="text-align:center;line-height:1.3;">\' + labels[bi] + \'</div>\' +\n' +
'          \'</div>\';\n' +
'      }\n' +
'      var chartH = \'<div style="display:flex;align-items:flex-end;gap:12px;margin:12px 0;padding:14px;background:var(--panel2);border-radius:12px;">\' + bars + \'</div>\';\n' +
'      var batchRes = document.getElementById("m4l-fo-batch-result");\n' +
'      if (batchRes) {\n' +
'        batchRes.innerHTML =\n' +
'          \'<div class="notice" style="margin-bottom:12px;">\' +\n' +
'            \'Out of 100 simulated drawings against a \' + fmt(M4L_FO_TOTAL) + \'-ticket crowd:<br>\' +\n' +
'            \'<strong style="color:var(--gold);">\' + dist[0] + \' had no jackpot winner (\' + dist[0] + \"%)</strong> &nbsp;|&nbsp; \" +\n" +
'            dist[1] + \' had 1 winner &nbsp;|&nbsp; \' +\n' +
'            dist[2] + \' had 2 winners &nbsp;|&nbsp; \' +\n' +
'            dist[3] + \' had 3 or more winners.\' +\n' +
'          \'</div>\' + chartH +\n' +
'          \'<div style="max-height:280px;overflow-y:auto;margin-top:8px;">\' +\n' +
'          \'<table><thead><tr><th>#</th><th>Numbers Drawn</th><th>Jackpot winners (est.)</th></tr></thead>\' +\n' +
'          \'<tbody>\' + logRows + \'</tbody></table></div>\';\n' +
'      }\n' +
'    } finally {\n' +
'      if (batchBtn) { batchBtn.disabled = false; batchBtn.textContent = "🔁 Run 100 drawings again"; }\n' +
'    }\n' +
'  }, 10);\n' +
'}\n' +
'\n';

html = html.replace(FN_ANCHOR, NEW_FUNCTIONS + FN_ANCHOR);
assertUnique(html, FN_ANCHOR, 'fn anchor after patch 2');

// ────────────────────────────────────────────────────────────────────────────
// PATCH 3 — add Full Odds HTML section inside m4lSimCardHTML() return value
// ────────────────────────────────────────────────────────────────────────────
const HTML_ANCHOR =
  "      '<div id=\"m4l-tickets-result\" style=\"margin-top:12px;\"></div>' +\n" +
  "    '</div>' +\n" +
  "\n" +
  "  '</div>';";
assertUnique(html, HTML_ANCHOR, 'html anchor');

const FO_HTML_SECTION =
  "      '<div id=\"m4l-tickets-result\" style=\"margin-top:12px;\"></div>' +\n" +
  "    '</div>' +\n" +
  "\n" +
  "    // ── Full-Odds Crowd section ─────────────────────────────────────────────\n" +
  "    '<div style=\"margin-top:22px;padding-top:20px;border-top:2px solid var(--cyan);\">' +\n" +
  "      '<div class=\"sectionTitle\" style=\"font-size:15px;\">🌐 Full-Odds Crowd — 22,910,580 Tickets</div>' +\n" +
  "      '<div class=\"notice\" style=\"margin-top:10px;font-size:12px;\">' +\n" +
  "        'Even when every one of the 22,910,580 possible ticket slots is filled by a simulated player, ' +\n" +
  "        'prize-sharing and the birthday-paradox dynamic mean that <strong>~37% of drawings still crown ' +\n" +
  "        'no jackpot winner</strong> — because players cluster on popular combinations while leaving ' +\n" +
  "        'others unplayed. Every real ticket always has exactly <strong>1 in 22,910,580</strong> top-prize odds ' +\n" +
  "        'regardless of what anyone else picks. Results are illustrative.' +\n" +
  "      '</div>' +\n" +
  "      '<div style=\"margin-top:12px;\">' +\n" +
  "        '<button id=\"m4l-fo-open-btn\" class=\"secondary\" onclick=\"m4lFullOddsOpen()\" ' +\n" +
  "          'style=\"min-height:44px;background:linear-gradient(135deg,#0a2540,#1a4a70);' +\n" +
  "          'border:2px solid var(--cyan);font-weight:700;font-size:13px;\">' +\n" +
  "          '🌐 FULL ODDS CROWD — 22,910,580' +\n" +
  "        '</button>' +\n" +
  "      '</div>' +\n" +
  "\n" +
  "      '<div id=\"m4l-fo-panel\" style=\"display:none;margin-top:14px;padding:14px;background:var(--panel2);border-radius:12px;border:1px solid var(--line);\">' +\n" +
  "        '<div class=\"sectionTitle\" style=\"font-size:13px;\">Choose simulation mode</div>' +\n" +
  "        '<div style=\"margin-top:10px;display:flex;flex-direction:column;gap:10px;\">' +\n" +
  "          '<label style=\"display:flex;gap:10px;align-items:flex-start;cursor:pointer;\">' +\n" +
  "            '<input type=\"radio\" id=\"m4l-fo-mode-fast\" name=\"m4l-fo-mode\" value=\"fast\" checked style=\"margin-top:3px;\">' +\n" +
  "            '<span><strong>Fast (scaled)</strong> — 200,000-ticket biased sample, results scaled to 22,910,580. Runs in &lt;1 s. Auto-selected on mobile / low-core devices.</span>' +\n" +
  "          '</label>' +\n" +
  "          '<label style=\"display:flex;gap:10px;align-items:flex-start;cursor:pointer;\">' +\n" +
  "            '<input type=\"radio\" id=\"m4l-fo-mode-exact\" name=\"m4l-fo-mode\" value=\"exact\" style=\"margin-top:3px;\">' +\n" +
  "            '<span><strong>Exact</strong> — Web Worker generates all 22,910,580 tickets in ~250K chunks. Co-winner counts are precise. Takes ~30–90 s on desktop. <em>Not recommended on mobile.</em></span>' +\n" +
  "          '</label>' +\n" +
  "        '</div>' +\n" +
  "        '<div style=\"display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;\">' +\n" +
  "          '<button id=\"m4l-fo-start-btn\" class=\"primary\" onclick=\"m4lFOStart()\" style=\"min-height:44px;\">&#9654; Start simulation</button>' +\n" +
  "          '<button id=\"m4l-fo-cancel-btn\" class=\"secondary\" onclick=\"m4lFOCancel()\" style=\"min-height:44px;display:none;\">&#10006; Cancel</button>' +\n" +
  "        '</div>' +\n" +
  "        '<div id=\"m4l-fo-prog\" style=\"display:none;margin-top:14px;\">' +\n" +
  "          '<progress id=\"m4l-fo-prog-bar\" max=\"22910580\" value=\"0\" style=\"width:100%;height:14px;\"></progress>' +\n" +
  "          '<div id=\"m4l-fo-prog-txt\" class=\"small\" style=\"margin-top:6px;color:var(--muted);\">Starting…</div>' +\n" +
  "        '</div>' +\n" +
  "        '<div id=\"m4l-fo-dist-area\" style=\"display:none;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);\"></div>' +\n" +
  "        '<div id=\"m4l-fo-draw-area\" style=\"display:none;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);\">' +\n" +
  "          '<div class=\"sectionTitle\" style=\"font-size:14px;\">Mock Drawing — Full-Odds Crowd</div>' +\n" +
  "          '<div class=\"small\" style=\"margin-bottom:10px;color:var(--muted);\">Picks a random 5 + MB combination and shows how many of the 22.9M simulated tickets hold it. Run multiple times for different outcomes.</div>' +\n" +
  "          '<button class=\"secondary\" onclick=\"m4lFODraw()\" style=\"min-height:44px;\">🎱 Draw numbers</button>' +\n" +
  "          '<div id=\"m4l-fo-draw-result\" style=\"margin-top:12px;\"></div>' +\n" +
  "        '</div>' +\n" +
  "        '<div id=\"m4l-fo-batch-area\" style=\"display:none;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);\">' +\n" +
  "          '<div class=\"sectionTitle\" style=\"font-size:14px;\">100-Drawing Batch — Fast Mode</div>' +\n" +
  "          '<div class=\"small\" style=\"margin-bottom:10px;color:var(--muted);\">Generates a fresh 200K-ticket sample, runs 100 independent random draws, and charts the distribution of jackpot-winner counts (scaled to 22.9M crowd).</div>' +\n" +
  "          '<button id=\"m4l-fo-batch-btn\" class=\"secondary\" onclick=\"m4lFOBatch100()\" style=\"min-height:44px;\">🔁 Run 100 drawings</button>' +\n" +
  "          '<div id=\"m4l-fo-batch-result\" style=\"margin-top:12px;\"></div>' +\n" +
  "        '</div>' +\n" +
  "      '</div>' +\n" +   // end panel
  "    '</div>' +\n" +      // end FO section
  "\n" +
  "  '</div>';";

html = html.replace(HTML_ANCHOR, FO_HTML_SECTION);
assertUnique(html, FO_HTML_SECTION.slice(0, 60), 'html anchor after patch 3');

// ────────────────────────────────────────────────────────────────────────────
// Integrity checks
// ────────────────────────────────────────────────────────────────────────────
const closeCount = (html.match(/<\/html>/g) || []).length;
if (closeCount !== 1) throw new Error('Expected 1 </html>, found ' + closeCount);

const scriptStart = html.indexOf('<script>');
const scriptEnd   = html.lastIndexOf('</script>');
if (scriptStart === -1 || scriptEnd === -1) throw new Error('Cannot find <script> tags');
try { new Function(html.slice(scriptStart + 8, scriptEnd)); }
catch (e) { throw new Error('Syntax error in patched <script>: ' + e.message); }

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('patch-fo: applied OK — ' + html.split('\n').length + ' lines');
