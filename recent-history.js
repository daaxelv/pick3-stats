// Real-result history and rolling exact-combination cooldown for NJ Pick 3.
// Shared by the browser and dependency-free Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pick3History = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DRAW_OPTIONS = Object.freeze([1, 3, 7, 14, 30]);

  function normalizeSettings(value) {
    const settings = value && typeof value === 'object' ? value : {};
    const draws = typeof settings.draws === 'number' || typeof settings.draws === 'string'
      ? Number(settings.draws) : NaN;
    return {
      enabled: settings.enabled !== false,
      draws: DRAW_OPTIONS.includes(draws) ? draws : 7,
      allDraws: settings.allDraws === true
    };
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }

  function normalizeResult(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    if (row.game !== undefined && row.game !== 'P3') return null;
    if (!validDate(row.date) || (row.draw !== 'MID' && row.draw !== 'EVE')) return null;
    let combo = row.combo;
    if (row.game === 'P3' && row.digits !== undefined) {
      if (typeof row.digits !== 'string' || !/^\d-\d-\d$/.test(row.digits)) return null;
      combo = row.digits.replace(/-/g, '');
    }
    if (typeof combo !== 'string' || !/^\d{3}$/.test(combo)) return null;
    const fireball = row.fireball === undefined ? '' : row.fireball;
    if (typeof fireball !== 'string' || !/^\d?$/.test(fireball)) return null;
    return { date: row.date, draw: row.draw, combo, fireball };
  }

  function normalizeResults(rows, { strict = false } = {}) {
    if (!Array.isArray(rows)) {
      if (strict) throw new TypeError('Pick 3 results must be an array.');
      return [];
    }
    const byDraw = new Map();
    rows.forEach((row, index) => {
      const result = normalizeResult(row);
      if (!result) {
        if (strict) throw new TypeError('Invalid Pick 3 result at row ' + (index + 1) + '.');
        return;
      }
      // One official result per date and session; a later correction wins.
      byDraw.set(result.date + '|' + result.draw, result);
    });
    return Array.from(byDraw.values()).sort((a, b) =>
      a.date.localeCompare(b.date) || (a.draw === b.draw ? 0 : a.draw === 'MID' ? -1 : 1)
    );
  }

  function mergeResults(base, manual) {
    return normalizeResults([...normalizeResults(base), ...normalizeResults(manual)]);
  }

  function cooldown(history, tabKey, settings) {
    const normalized = normalizeSettings(settings);
    const session = tabKey === 'mid' ? 'MID' : tabKey === 'eve' ? 'EVE' : null;
    const scoped = normalizeResults(history).filter(row =>
      normalized.allDraws || !session || row.draw === session
    );
    const window = scoped.slice(-normalized.draws);
    return {
      ...normalized,
      window,
      excluded: new Set(normalized.enabled ? window.map(row => row.combo) : []),
      availableCount: scoped.length
    };
  }

  return { DRAW_OPTIONS, normalizeSettings, normalizeResults, mergeResults, cooldown };
});
