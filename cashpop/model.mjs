export function validateRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid CASH POP archive');
  const seen = new Set();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.draw_no) || row.draw_no < 1 || seen.has(row.draw_no) ||
        !Number.isInteger(row.number) || row.number < 1 || row.number > 15 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(row.date_time)) throw new Error('Invalid or duplicate CASH POP result');
    seen.add(row.draw_no);
  }
  return rows;
}

export function frequencies(draws) {
  validateRows(draws);
  const rows = Array.from({length: 15}, (_, i) => ({number: i+1, hits: 0, share: 0, last_draw: null, last_date: null}));
  for (const draw of draws) {
    const row = rows[draw.number-1];
    row.hits++;
    if (row.last_draw === null || draw.draw_no > row.last_draw) {
      row.last_draw = draw.draw_no; row.last_date = draw.date_time;
    }
  }
  for (const row of rows) row.share = draws.length ? row.hits / draws.length : 0;
  const ranked = sortRows(rows, 'hits', 'desc');
  ranked.forEach((row, i) => { row.rank = i+1; });
  return rows;
}

export function sortRows(rows, key = 'hits', direction = 'desc') {
  if (!['number','hits','share','last_draw','rank'].includes(key) || !['asc','desc'].includes(direction)) throw new Error('Invalid sort');
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a,b) => {
    if (a[key] === null && b[key] !== null) return 1;
    if (b[key] === null && a[key] !== null) return -1;
    return sign * ((a[key] ?? 0) - (b[key] ?? 0)) || a.number-b.number;
  });
}

export function playCost(numbers, wager, draws) {
  if (!Number.isInteger(numbers) || numbers < 1 || numbers > 15 ||
      ![1,2,5,10,20].includes(wager) || !Number.isInteger(draws) || draws < 1 || draws > 20) throw new Error('Invalid play');
  return {cost: numbers*wager*draws, matchChance: numbers/15};
}
