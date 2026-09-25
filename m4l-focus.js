// An exploratory view of the user's 04 ... MB:04 ticket lists. Scores describe
// past draws only; every valid M4L combination has the same draw probability.
const m4lFocus = { tickets: null, error: '' };

function parseM4LCandidates(text, list) {
  return text.trim().split(/\r?\n/).slice(1).map(line => {
    const cells = line.split(',');
    const match = /^((?:\d{2}-){4}\d{2}) MB:04$/.exec(cells[0]);
    if (!match) return null;
    const numbers = match[1].split('-').map(Number);
    if (numbers.some((n, i) => n < 1 || n > 58 || (i && n <= numbers[i-1]))) return null;
    return { numbers, list };
  }).filter(Boolean);
}

function rankM4LCandidates(tickets, rows) {
  const matching = rows.filter(r => r.mb == 4 && r.numbers.includes(4));
  const focusCounts = Array(59).fill(0);
  const allCounts = Array(59).fill(0);
  rows.forEach(r => r.numbers.forEach(n => { if (n >= 1 && n <= 58) allCounts[n]++; }));
  matching.forEach(r => r.numbers.filter(n => n !== 4).forEach(n => focusCounts[n]++));
  const previous = new Set(rows.map(r => r.numbers.join('-') + ':' + r.mb));
  const unique = new Map();
  tickets.filter(t => t.numbers.includes(4)).forEach(t => {
    const key = t.numbers.join('-') + ':4';
    const middle = t.numbers.filter(n => n !== 4);
    const entry = {
      ...t, middle,
      focusScore: middle.reduce((sum, n) => sum + focusCounts[n], 0),
      allScore: middle.reduce((sum, n) => sum + allCounts[n], 0),
      repeated: previous.has(key)
    };
    if (!unique.has(key)) unique.set(key, entry);
    else unique.get(key).list += ' + ' + t.list;
  });
  return { matching, focusCounts, allCounts,
    ranked: [...unique.values()].sort((a,b) =>
      b.focusScore-a.focusScore || b.allScore-a.allScore ||
      a.numbers.join('-').localeCompare(b.numbers.join('-'))) };
}

function renderM4LFocus(pane, rows) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginTop = '16px';
  card.innerHTML = '<div class="sectionTitle">Your 04 + Millionaire Ball 04 ticket lists</div>' +
    '<div class="notice">04 may appear anywhere among the five sorted main balls, including after 01, 02, or 03. The Millionaire Ball must be 04. Compare the other four main numbers using recorded draws with both 04s. ' +
    '<strong>Every valid combination has the same chance on the next draw, including combinations drawn before.</strong> Past repeats may feel unlikely, but history does not reduce their chance. This ranking is a way to organize plays, not a forecast.</div>' +
    '<div class="controls" style="margin-top:12px;"><label>Show <select id="m4l-focus-list"><option value="both">Both lists</option><option value="351">351: both high</option><option value="756">756: one high</option></select></label>' +
    '<label>Tickets <select id="m4l-focus-limit"><option value="10">Top 10</option><option value="25">Top 25</option><option value="50">Top 50</option></select></label>' +
    '<button class="secondary" id="m4l-focus-load">Rank my 04 tickets</button></div>' 
    '<div id="m4l-focus-results" style="margin-top:12px;"></div>';
  const sim = pane.querySelector('#m4l-sim-card');
  if (sim) pane.insertBefore(card, sim); else pane.appendChild(card);
  card.querySelector('#m4l-focus-load').onclick = () => loadM4LFocus(card, rows);
  card.querySelector('#m4l-focus-list').onchange = () => showM4LFocus(card, rows);
  card.querySelector('#m4l-focus-limit').onchange = () => showM4LFocus(card, rows);
  if (m4lFocus.tickets || m4lFocus.error) showM4LFocus(card, rows);
}

async function loadM4LFocus(card, rows) {
  const output = card.querySelector('#m4l-focus-results');
  output.textContent = 'Loading your ticket lists…';
  try {
        const paths = ['data/m4l_351_both_high.csv','data/m4l_756_one_high.csv'];
    const texts = await Promise.all(paths.map(async path => {
      const response = await fetch(path, {cache:'no-store'});
      if (!response.ok) throw new Error('Could not load ' + path);
      return response.text();
    }));
    m4lFocus.tickets = [
      ...parseM4LCandidates(texts[0], '351'),
      ...parseM4LCandidates(texts[1], '756')
    ];
    m4lFocus.error = '';
  } catch (error) { m4lFocus.error = error.message; }
  showM4LFocus(card, rows);
}

function showM4LFocus(card, rows) {
  const output = card.querySelector('#m4l-focus-results');
  if (m4lFocus.error) { output.textContent = m4lFocus.error; return; }
  if (!m4lFocus.tickets) return;
  const list = card.querySelector('#m4l-focus-list').value;
  const source = m4lFocus.tickets.filter(t => list === 'both' || t.list === list);
  const {matching, focusCounts, ranked} = rankM4LCandidates(source, rows);
  const count = Number(card.querySelector('#m4l-focus-limit').value);
  const historic = matching.length ? matching.map(r => r.date + ': ' + r.numbers.map(n => String(n).padStart(2,'0')).join('-') + ' MB:04').join(' · ') : 'None in the loaded history';
  const frequency = [...focusCounts.entries()].filter(([n, hits]) => n !== 4 && hits > 0)
    .sort((a,b) => b[1]-a[1] || a[0]-b[0]).slice(0,12)
    .map(([n,hits]) => String(n).padStart(2,'0') + ' (' + hits + ')').join(', ');
  // Values below come exclusively from the locally validated CSV and live draw rows.
  output.innerHTML = '<div class="small">' + ranked.length + ' unique tickets containing 04 with MB:04 in this list. ' +
    rows.length + ' draws on file; ' + matching.length + ' past draws match both 04s. The middle-number score sums appearances in those matching draws; ties use appearances across all M4L draws. Small samples are unstable.</div>' +
    '<div class="small" style="margin-top:8px;">Middle numbers in matching draws: ' + (frequency || 'none') + '</div>' +
    '<div class="small" style="margin-top:8px;">Matching draw log: ' + historic + '</div>' +
    '<div style="overflow-x:auto;max-height:500px;overflow-y:auto;margin-top:12px;"><table><thead><tr><th>#</th><th>Ticket</th><th>Focused hits</th><th>All-history hits</th><th>Drawn before?</th><th>List</th></tr></thead><tbody>' +
    ranked.slice(0,count).map((t,i) => '<tr><td>' + (i+1) + '</td><td class="mono">' + t.numbers.map(n=>String(n).padStart(2,'0')).join('-') + ' MB:04</td><td>' + t.focusScore + '</td><td>' + t.allScore + '</td><td>' + (t.repeated?'Yes':'No') + '</td><td>' + t.list + '</td></tr>').join('') +
    '</tbody></table></div>';
}
