// Integration tests for the actual inline Pick 3 engine. Run: node --test cooldown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const mainScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).find(script => script.includes('const FALLBACK_ENGINE_DATA'));
assert.ok(mainScript, 'the main application script exists');
const appScript = mainScript.replace(/\binit\(\);\s*startCountdown\(\);\s*$/, '');
assert.notEqual(appScript, mainScript, 'remove only the automatic browser startup');
const historyScript = readFileSync(new URL('./recent-history.js', import.meta.url), 'utf8');

function harness(initialStorage = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const elements = new Map();
  const element = value => ({ value, checked: false, style: {}, dataset: {}, textContent: '', innerHTML: '', addEventListener() {} });
  const context = vm.createContext({
    console, Date, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    navigator: {}, location: { protocol: 'https:' },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    document: {
      getElementById: id => elements.get(id) || null,
      querySelectorAll: () => [], addEventListener() {}, dispatchEvent() {},
      createElement: () => element(''), body: { appendChild() {}, removeChild() {} },
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    FileReader: class { readAsText(file) { this.onload({ target: { result: file.text } }); } },
    fetch: async () => { throw new Error('offline'); },
    confirm: () => true,
    addEventListener() {}, dispatchEvent() {},
  });
  context.window = context;
  vm.runInContext(historyScript, context, { filename: 'recent-history.js' });
  for (const filename of ['crowd-model.js','feed-status.js','m4l-focus.js']) {
    vm.runInContext(readFileSync(new URL('./'+filename,import.meta.url),'utf8'),context,{filename});
  }
  vm.runInContext(appScript, context, { filename: 'index.html' });
  vm.runInContext(`
    originalRenderDataPane = renderDataPane;
    renderEngine = function() {};
    renderDataPane = function() {};
    renderTopSummary = function() {};
    renderP4Pane = function() {};
    renderM4LPane = function() {};
    rerenderTrackerRows = function() {};
    showToast = function() {};
    showAutoRefreshBanner = function() {};
  `, context);
  const evaluate = code => vm.runInContext(code, context);
  for (const tab of ['eve', 'mid', 'both']) {
    const prefs = evaluate(`state.recentFilter.${tab}`);
    elements.set(`${tab}-agents`, element('100000'));
    elements.set(`${tab}-mode`, element('both'));
    elements.set(`${tab}-crowd-model`, element(evaluate(`state.crowdPreferences.${tab}`)));
    elements.set(`${tab}-exclude-recent`, { ...element(''), checked: prefs.enabled });
    elements.set(`${tab}-recent-n`, element(String(prefs.draws)));
    elements.set(`${tab}-recent-all`, { ...element(''), checked: prefs.allDraws });
    elements.set(`${tab}-recent-n-wrap`, element(''));
    elements.set(`${tab}-exclude-notice`, element(''));
  }
  return {
    context, storage, elements, evaluate,
    setElement(id, value) { elements.set(id, element(value)); },
    setRows(rows) {
      context.__rows = rows;
      evaluate('ENGINE_DATA = buildEngineDataFromRows(__rows)');
    },
    setManual(rows) { context.__manual = rows; evaluate('state.manualOfficialUpdates = __manual'); },
    run(tab = 'eve', options = {}) {
      if ('enabled' in options) elements.get(`${tab}-exclude-recent`).checked = options.enabled;
      if ('draws' in options) elements.get(`${tab}-recent-n`).value = String(options.draws);
      if ('allDraws' in options) elements.get(`${tab}-recent-all`).checked = options.allDraws;
      if ('mode' in options) elements.get(`${tab}-mode`).value = options.mode;
      context.runEngine(tab);
      return evaluate(`state.results.${tab}`);
    },
    setCsv(rows) {
      const csv = ['game,date,draw,digits,fireball,prize_straight', ...rows.map(row =>
        [row.game || 'P3', row.date, row.draw, row.digits || row.combo.split('').join('-'), row.fireball || '', row.prize_straight || ''].join(','))].join('\n');
      context.fetch = async url => url.endsWith('.json') ? {ok:false,status:404} : ({ ok: true, text: async () => csv });
    },
  };
}

function row(day, draw, combo, fireball = '') {
  return { date: new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10), draw, combo, fireball };
}
function canonical(record) { return { game: 'P3', ...record, digits: record.combo.split('').join('-') }; }
function combos(rows) { return Array.from(rows, record => record.combo); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function assertSectionsFiltered(result) {
  for (const key of ['eligible', 'top25', 'ranked100', 'uniqueSection', 'repeatSection', 'overlap', 'plan']) {
    if (['eligible', 'top25', 'plan'].includes(key)) assert.ok(result[key].length > 0, `${key} should contain candidates`);
    for (const record of result[key]) assert.equal(result.cooldown.excluded.has(record.combo), false, `${key} leaked ${record.combo}`);
  }
  assert.equal(result.plan.length, 10);
}

test('fresh settings enable seven-draw cooldown per engine and expose all requested options', () => {
  const app = harness();
  for (const tab of ['eve', 'mid', 'both']) {
    assert.deepEqual(plain(app.evaluate(`state.recentFilter.${tab}`)), { enabled: true, draws: 7, allDraws: false });
    const markup = app.context.engineSkeleton(tab, '', '');
    const checkbox = markup.match(new RegExp(`<input[^>]*id="${tab}-exclude-recent"[^>]*>`));
    assert.ok(checkbox && /\bchecked\b/.test(checkbox[0]));
    const select = markup.match(new RegExp(`<select[^>]*id="${tab}-recent-n"[^>]*>([\\s\\S]*?)<\\/select>`));
    assert.ok(select);
    assert.deepEqual([...select[1].matchAll(/value="(\d+)"/g)].map(match => Number(match[1])), [1, 3, 7, 14, 30]);
    assert.match(select[1], /<option[^>]*value="7"[^>]*selected/);
    assert.ok(markup.includes(`${tab}-recent-all`));
  }
});

test('each window excludes exactly the last N real draws, and all recommendations use it', () => {
  const app = harness();
  const rows = Array.from({ length: 40 }, (_, index) => row(index + 1, 'EVE', String(index + 100)));
  app.setRows(rows.slice().reverse().map(canonical));
  for (const n of [1, 3, 7, 14, 30]) {
    const result = app.run('eve', { draws: n });
    assert.deepEqual(combos(result.cooldown.window), combos(rows.slice(-n)));
    assert.deepEqual([...result.cooldown.excluded].sort(), combos(rows.slice(-n)).sort());
    assert.equal(result.eligible.some(record => record.combo === rows.at(-n - 1).combo), true, `draw ${n + 1} must be eligible`);
    assert.equal(result.eligible.length, 1000 - n);
    assertSectionsFiltered(result);
  }
});

test('a winner automatically returns after seven later results and remains stored', () => {
  const app = harness();
  const history = [row(1, 'EVE', '789'), ...Array.from({ length: 6 }, (_, i) => row(i + 2, 'EVE', String(120 + i)))];
  app.setRows(history);
  assert.equal(app.run().cooldown.excluded.has('789'), true);
  app.context.addOrReplaceManualUpdate('2026-01-08', 'EVE', '246', '', true);
  const result = app.run();
  assert.equal(result.cooldown.excluded.has('789'), false);
  assert.equal(result.eligible.some(record => record.combo === '789'), true);
  assert.equal(result.dataset.total_draws, 8);
  assert.equal(app.evaluate('engineDataForRecommendations().history.length'), 8);
});

test('Midday and Evening are isolated; Combined and ALL scope use MID then EVE chronology', () => {
  const app = harness();
  app.setRows([row(2, 'EVE', '884'), row(1, 'EVE', '987'), row(2, 'MID', '007'), row(1, 'MID', '112')]);
  assert.deepEqual(combos(app.evaluate('ENGINE_DATA.history')), ['112', '987', '007', '884']);
  const mid = app.run('mid', { draws: 1 });
  assert.deepEqual([...mid.cooldown.excluded], ['007']);
  assert.equal(mid.eligible.some(record => record.combo === '884'), true);
  assert.deepEqual([...app.run('eve', { draws: 1 }).cooldown.excluded], ['884']);
  assert.deepEqual([...app.run('both', { draws: 3 }).cooldown.excluded], ['987', '007', '884']);
  assert.deepEqual([...app.run('mid', { draws: 1, allDraws: true }).cooldown.excluded], ['884']);
  assert.equal(app.evaluate('ENGINE_DATA.datasets.BOTH.overdue[884]'), 0);
  assert.equal(app.evaluate('ENGINE_DATA.datasets.BOTH.overdue[7]'), 1);
});

test('repeated winners consume separate draw slots and leading zeros remain exact combos', () => {
  const app = harness();
  app.setRows([row(1, 'EVE', '789'), row(2, 'EVE', '007'), row(3, 'EVE', '007'), row(4, 'EVE', '007')]);
  const result = app.run('eve', { draws: 3 });
  assert.equal(result.cooldown.window.length, 3);
  assert.deepEqual([...result.cooldown.excluded], ['007']);
  assert.equal(result.eligible.length, 999);
  assert.ok(result.eligible.some(record => record.combo === '789'));
});

test('turning cooldown off restores eligibility even for manually entered winners', () => {
  const app = harness();
  app.setRows([row(1, 'EVE', '246')]);
  app.context.addOrReplaceManualUpdate('2026-01-02', 'EVE', '789', '', true);
  assert.equal(app.run().cooldown.excluded.has('789'), true);
  const disabled = app.run('eve', { enabled: false });
  assert.equal(disabled.cooldown.excluded.size, 0);
  assert.equal(disabled.eligible.length, 1000);
  assert.equal(disabled.eligible.find(record => record.combo === '789').histFreq, 1);
});

test('manual corrections and matching feed results replace a draw instead of double counting', () => {
  const app = harness();
  app.setRows([row(1, 'MID', '123'), row(1, 'EVE', '456'), row(2, 'MID', '007')]);
  app.context.addOrReplaceManualUpdate('2026-01-01', 'EVE', '789', '0', true);
  app.context.addOrReplaceManualUpdate('2026-01-02', 'MID', '007', '', true);
  const evening = app.run('eve');
  assert.equal(evening.dataset.total_draws, 1);
  assert.equal(evening.dataset.combo_freq[456], 0);
  assert.equal(evening.dataset.combo_freq[789], 1);
  assert.equal(app.run('mid').dataset.total_draws, 2);
  assert.equal(app.run('mid').dataset.combo_freq[7], 1);
  assert.equal(app.run('both').dataset.total_draws, 3);
  // The canonical feed catches up to the manual result, keeping one draw.
  app.setRows([row(1, 'MID', '123'), row(1, 'EVE', '789', '0'), row(2, 'MID', '007')]);
  assert.equal(app.run('both').dataset.total_draws, 3);
  assert.deepEqual(combos(app.evaluate('engineDataForRecommendations().history')), ['123', '789', '007']);
});

test('out-of-order manual input is saved chronologically and computes the actual gap', () => {
  const app = harness();
  app.setRows([]);
  app.context.addOrReplaceManualUpdate('2026-01-02', 'EVE', '789', '', true);
  app.context.addOrReplaceManualUpdate('2026-01-01', 'EVE', '246', '', true);
  app.context.addOrReplaceManualUpdate('2026-01-02', 'MID', '007', '', true);
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['246', '007', '789']);
  assert.deepEqual(combos(JSON.parse(app.storage.get('nj_pick3_manual_updates_v1'))), ['246', '007', '789']);
  const result = app.run('both', { draws: 1 });
  assert.equal(result.eligible.find(record => record.combo === '246').overdue, 2);
  assert.equal(result.eligible.find(record => record.combo === '007').overdue, 1);
  assert.equal(result.cooldown.excluded.has('789'), true);
});

test('existing saved updates are normalized without losing valid historical results', () => {
  const saved = [row(3, 'EVE', '789'), row(1, 'EVE', '007'), row(2, 'MID', '112'), row(3, 'EVE', '884')];
  const app = harness({ nj_pick3_manual_updates_v1: JSON.stringify(saved) });
  app.setRows([]);
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['007', '112', '884']);
  assert.deepEqual([...app.run('eve', { draws: 1 }).cooldown.excluded], ['884']);
  assert.ok(app.run('eve').eligible.some(record => record.combo === '112'));
});

test('manual entry and deletion rebuild the same cooldown used by every recommendation', () => {
  const app = harness();
  app.setRows([row(1, 'EVE', '246')]);
  for (const [id, value] of Object.entries({ updDate: '2026-01-02', updDraw: 'EVE', upd1: '7', upd2: '8', upd3: '9', updFB: '0' })) {
    app.setElement(id, value);
  }
  app.context.addManualOfficialResult();
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['789']);
  assert.equal(app.evaluate('state.results.eve.cooldown.excluded.has("789")'), true);
  assert.equal(app.evaluate('state.results.mid.cooldown.excluded.has("789")'), false);
  app.context.removeManualOfficialResult(0);
  assert.equal(app.evaluate('state.manualOfficialUpdates.length'), 0);
  assert.equal(app.evaluate('state.results.eve.cooldown.excluded.has("789")'), false);
  assert.equal(app.evaluate('state.results.eve.eligible.some(row => row.combo === "789")'), true);
});

test('JSON backups normalize order and duplicates before rerunning all three engines', () => {
  const app = harness();
  app.setRows([]);
  const backup = [row(2, 'EVE', '789'), row(1, 'EVE', '246'), row(2, 'MID', '007'), row(2, 'EVE', '884')];
  app.context.importBackup({ files: [{ text: JSON.stringify(backup) }], value: 'backup.json' });
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['246', '007', '884']);
  assert.equal(app.evaluate('state.results.both.dataset.total_draws'), 3);
  assert.equal(app.evaluate('state.results.both.cooldown.excluded.has("884")'), true);
});

test('invalid backup does not overwrite previously saved real results', () => {
  const app = harness();
  app.context.addOrReplaceManualUpdate('2026-01-01', 'EVE', '007', '', true);
  const before = plain(app.evaluate('state.manualOfficialUpdates'));
  app.context.importBackup({ files: [{ text: JSON.stringify({ rows: [] }) }], value: 'invalid.json' });
  assert.deepEqual(plain(app.evaluate('state.manualOfficialUpdates')), before);
  app.context.importBackup({ files: [{ text: JSON.stringify([row(2, 'EVE', '789'), { date: '2026-02-31', draw: 'MID', combo: '007' }]) }], value: 'partially-invalid.json' });
  assert.deepEqual(plain(app.evaluate('state.manualOfficialUpdates')), before);
});

test('bulk entry sorts real results, preserves leading zeros, and shares the cooldown', () => {
  const app = harness();
  app.setRows([]);
  app.setElement('bulkResults', '2026-01-03 EVE 789 0\n01/02/2026 MID 007 5\n2026-01-01 EVE 884');
  app.context.bulkImportOfficialResults();
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['884', '007', '789']);
  assert.equal(app.evaluate('state.results.both.dataset.total_draws'), 3);
  assert.equal(app.evaluate('state.results.mid.cooldown.excluded.has("007")'), true);
});

test('tracker winner entry persists a real result and updates the recommendation cooldown', () => {
  const app = harness();
  app.setRows([]);
  for (const [id, value] of Object.entries({ winDate: '2026-01-01', winDraw: 'MID', win1: '0', win2: '0', win3: '7', winFB: '0' })) {
    app.setElement(id, value);
  }
  app.context.addWinningDraw();
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['007']);
  assert.equal(app.evaluate('state.manualOfficialUpdates[0].fireball'), '0');
  assert.equal(app.evaluate('state.results.mid.cooldown.excluded.has("007")'), true);
  assert.equal(app.evaluate('state.results.eve.cooldown.excluded.has("007")'), false);
  assert.equal(JSON.parse(app.storage.get('nj_pick3_manual_updates_v1'))[0].combo, '007');
  app.setElement('win3', '8');
  app.context.addWinningDraw();
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['008']);
  assert.equal(app.evaluate('state.results.mid.dataset.total_draws'), 1);
  app.setElement('win1', 'x');
  app.context.addWinningDraw();
  assert.deepEqual(combos(app.evaluate('state.manualOfficialUpdates')), ['008']);
});

test('cooldown choices persist independently across reloads', () => {
  const app = harness();
  app.setRows([]);
  app.run('eve', { draws: 30, allDraws: true, enabled: false });
  app.run('mid', { draws: 3 });
  const restored = harness(Object.fromEntries(app.storage));
  assert.deepEqual(plain(restored.evaluate('state.recentFilter.eve')), { enabled: false, draws: 30, allDraws: true });
  assert.deepEqual(plain(restored.evaluate('state.recentFilter.mid')), { enabled: true, draws: 3, allDraws: false });
  assert.deepEqual(plain(restored.evaluate('state.recentFilter.both')), { enabled: true, draws: 7, allDraws: false });
});

test('successful live refresh merges manual results and failed reload retains known real history', async () => {
  const app = harness();
  app.setCsv([row(1, 'MID', '007'), row(1, 'EVE', '789')]);
  assert.equal(await app.context.loadLiveData(), true);
  app.context.addOrReplaceManualUpdate('2026-01-02', 'MID', '112', '', true);
  app.run('mid', { draws: 1, allDraws: true });
  app.setCsv([row(1, 'MID', '007'), row(1, 'EVE', '789'), row(2, 'MID', '112')]);
  await app.context.refreshLiveData();
  assert.equal(app.evaluate('state.results.both.dataset.total_draws'), 3);
  assert.deepEqual([...app.evaluate('state.results.mid.cooldown.excluded')], ['112']);
  const before = plain(app.evaluate('ENGINE_DATA.history'));
  app.context.fetch = async () => { throw new Error('temporary connection loss'); };
  assert.equal(await app.context.loadLiveData(), false);
  assert.deepEqual(plain(app.evaluate('ENGINE_DATA.history')), before);
  assert.deepEqual([...app.run('mid').cooldown.excluded], ['112']);
});

test('cached chronological history survives a browser restart with an unavailable live feed', async () => {
  const app = harness();
  app.setCsv([row(1, 'MID', '007'), row(1, 'EVE', '789')]);
  await app.context.loadLiveData();
  assert.ok(app.storage.has('nj_pick3_history_v1'));
  const restored = harness(Object.fromEntries(app.storage));
  restored.context.restoreCachedHistory();
  assert.equal(await restored.context.loadLiveData(), false);
  assert.deepEqual(combos(restored.evaluate('ENGINE_DATA.history')), ['007', '789']);
  assert.deepEqual([...restored.run('both', { draws: 1 }).cooldown.excluded], ['789']);
});

test('background polling applies appended draws and same-size corrections while preserving choices', async () => {
  const app = harness();
  app.setCsv([row(1, 'MID', '007'), row(1, 'EVE', '789')]);
  await app.context.loadLiveData();
  app.run('both', { draws: 1 });
  app.setCsv([row(1, 'MID', '007'), row(1, 'EVE', '789'), row(2, 'MID', '112')]);
  await app.context._pollCsvOnce();
  assert.deepEqual([...app.evaluate('state.results.both.cooldown.excluded')], ['112']);
  app.setCsv([row(1, 'MID', '007'), row(1, 'EVE', '789'), row(2, 'MID', '884')]);
  await app.context._pollCsvOnce();
  assert.deepEqual([...app.evaluate('state.results.both.cooldown.excluded')], ['884']);
  assert.equal(app.evaluate('state.recentFilter.both.draws'), 1);
});

test('live loading preserves Pick 4, Millionaire for Life, and payout data alongside Pick 3 cooldown', async () => {
  const app = harness();
  app.setCsv([
    { ...row(1, 'MID', '007', '5'), prize_straight: '275.50' },
    { game: 'P4', date: '2026-01-01', draw: 'EVE', digits: '1-2-3-4', fireball: '6' },
    { game: 'M4L', date: '2026-01-01', draw: '', digits: '2-14-28-37-42', fireball: '3' },
  ]);
  await app.context.loadLiveData();
  assert.equal(app.run('both').dataset.total_draws, 1);
  assert.equal(app.evaluate('P4_INFO.rowCount'), 1);
  assert.equal(app.evaluate('M4L_INFO.rowCount'), 1);
  assert.deepEqual(plain(app.evaluate('M4L_INFO.rows[0].numbers')), [2, 14, 28, 37, 42]);
  assert.equal(app.evaluate('PAYOUT_STATS.straight.double.avg'), 275.5);
  assert.deepEqual([...app.run('both').cooldown.excluded], ['007']);
});

test('the repository CSV produces the same final seven chronological draws in each engine', () => {
  const app = harness();
  const csv = readFileSync(new URL('./data/nj_numbers_canonical.csv', import.meta.url), 'utf8');
  const parsed = app.context.parseCanonicalCsv(csv);
  app.setRows(parsed);
  const chronological = Array.from(parsed).filter(record => record.game === 'P3')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.draw === b.draw ? 0 : a.draw === 'MID' ? -1 : 1));
  for (const [tab, session] of [['eve', 'EVE'], ['mid', 'MID'], ['both', null]]) {
    const expected = chronological.filter(record => !session || record.draw === session).slice(-7)
      .map(record => record.digits.replaceAll('-', ''));
    const result = app.run(tab);
    assert.deepEqual(combos(result.cooldown.window), expected);
    assertSectionsFiltered(result);
  }
});

test('aggregate-only fallback never fabricates chronological exclusions from overdue arrays', () => {
  const app = harness();
  const result = app.run('eve', { draws: 30 });
  assert.equal(result.cooldown.availableCount, 0);
  assert.equal(result.cooldown.excluded.size, 0);
  assert.equal(result.eligible.length, 1000);
});

test('new crowd runs resample; reranking and feed refresh reuse the same crowd', async()=>{
  const app=harness();
  app.evaluate('Pick3Crowd.seed=()=>123');
  const first=app.run('eve');
  assert.equal(first.crowd.model,'sample');
  assert.equal(first.crowd.counts.reduce((a,b)=>a+b),100000);
  app.evaluate('Pick3Crowd.seed=()=>456');
  const rerank=app.run('eve',{mode:'uniqueness'});
  assert.equal(rerank.crowd,first.crowd);
  app.context.runEngine('eve',true);
  const fresh=app.evaluate('state.results.eve');
  assert.notDeepEqual(plain(fresh.crowd.counts),plain(first.crowd.counts));
  assert.equal(fresh.crowd.run,2);
  assertSectionsFiltered(fresh);
  for(const section of ['top25','ranked100','uniqueSection','repeatSection','plan']) for(const r of fresh[section]) {
    assert.equal(r.estPlayers,fresh.crowd.counts[Number(r.combo)]);
  }
  app.setCsv([row(1,'MID','007'),row(1,'EVE','999')]);
  await app.context._pollCsvOnce();
  assert.equal(app.evaluate('state.results.eve.crowd'),fresh.crowd);
});

test('stable estimate gives identical plans on repeat and crowd preferences persist',()=>{
  const app=harness();
  app.setElement('eve-crowd-model','expected');
  const first=app.run('eve');
  app.context.runEngine('eve',true);
  assert.deepEqual(combos(app.evaluate('state.results.eve.plan')),combos(first.plan));
  const restored=harness(Object.fromEntries(app.storage));
  assert.equal(restored.evaluate('state.crowdPreferences.eve'),'expected');
  assert.equal(restored.evaluate('state.crowdPreferences.mid'),'sample');
});

test('truncated CSV is rejected without losing prior exclusions',async()=>{
  const app=harness();
  app.setCsv([row(1,'MID','007'),row(1,'EVE','999')]);
  await app.context.loadLiveData();
  app.setCsv([row(1,'MID','007')]);
  assert.equal(await app.context.loadLiveData(),false);
  assert.equal(app.evaluate('ENGINE_DATA.history.length'),2);
  assert.equal(app.run('eve').cooldown.excluded.has('999'),true);
});

test('unchanged and failed polls refresh health without resampling',async()=>{
  const app=harness();
  app.setCsv([row(1,'MID','007'),row(1,'EVE','999')]);
  await app.context._pollCsvOnce();
  const first=app.evaluate('state.results.eve.crowd');
  app.context.fetch=async()=>{throw Error('offline');};
  await app.context._pollCsvOnce();
  assert.equal(app.evaluate('state.dataSource.ok'),false);
  assert.equal(app.evaluate('state.results.eve.crowd'),first);
  app.setCsv([row(1,'MID','007'),row(1,'EVE','999')]);
  await app.context._pollCsvOnce();
  assert.equal(app.evaluate('state.dataSource.ok'),true);
  assert.equal(app.evaluate('state.results.eve.crowd'),first);
});


test('collector metadata reaches coverage and engine notices without inventing a check time', async()=>{
  const app=harness();
  app.setCsv([row(1,'MID','007'),row(1,'EVE','999')]);
  const csvFetch=app.context.fetch;
  const metadata={schema_version:1,checked_at:'2026-09-22T04:00:00Z',ok:false,
    sources:{P3_MID:{ok:true,conflicts:[]},P3_EVE:{ok:false,conflicts:[]}}};
  app.context.fetch=async url=>url.endsWith('.json') ? {ok:true,json:async()=>metadata}:csvFetch(url);
  await app.context.loadLiveData();
  app.setElement('pane-data','');
  app.context.originalRenderDataPane();
  const markup=app.elements.get('pane-data').innerHTML;
  assert.ok(markup.includes(new Date(metadata.checked_at).toLocaleString()));
  assert.match(markup,/Collector last checked/);
  assert.match(markup,/A source needs attention/);
  app.setElement('eve-feed-notice','');
  app.context.renderFeedNotice('eve');
  assert.match(app.elements.get('eve-feed-notice').textContent,/could not read a Pick 3 source/);
  const fresh=harness();
  fresh.setElement('pane-data','');
  fresh.context.originalRenderDataPane();
  assert.match(fresh.elements.get('pane-data').innerHTML,/Not yet reported/);
});
