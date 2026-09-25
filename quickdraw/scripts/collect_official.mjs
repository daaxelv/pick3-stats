/** Resumable NJ Lottery draw-range collector. Run from the repository root. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dataDir = path.resolve('quickdraw/data');
const pageUrl = 'https://www.njlottery.com/en-us/drawgames/quickDraw.html';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const maxBatches = args.includes('--max-batches') ? Number(option('--max-batches')) : 25;
if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 200) {
  throw new Error('--max-batches must be an integer from 1 to 200');
}
const coverage = JSON.parse(await fs.readFile(path.join(dataDir, 'coverage.json'), 'utf8'));
const windows = [];
for (const gap of coverage.gaps) {
  for (let first = gap.from; first <= gap.to && windows.length < maxBatches; first += 500) {
    windows.push([first, Math.min(first + 499, gap.to)]);
  }
}
console.log(`Next ${windows.length} historical ranges:`, windows.map(pair => pair.join('–')).join(', '));
if (args.includes('--plan')) process.exit(0);

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
let completed = 0;
try {
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The official table begins with the latest published draw. Capture new
  // results before the historical batches so the browser feed stays current.
  const latestText = await page.locator('tr[data-toggle="tableWinningNumbers"] strong').first().textContent({ timeout: 30000 });
  const latest = Number(latestText?.match(/\d+/)?.[0]);
  if (!Number.isSafeInteger(latest) || latest < coverage.last_draw - 500) {
    throw new Error(`Could not determine the official latest draw: ${latestText}`);
  }
  const tail = [];
  for (let first = coverage.last_draw + 1; first <= latest && tail.length < maxBatches; first += 500) {
    tail.push([first, Math.min(first + 499, latest)]);
  }
  windows.unshift(...tail);
  windows.length = Math.min(windows.length, maxBatches);
  console.log(`Collecting ${tail.length} recent and ${windows.length - tail.length} historical ranges; official latest #${latest}`);
  await page.getByRole('radio', { name: 'Draw Range' }).check();
  for (const [first, last] of windows) {
    await page.getByRole('textbox', { name: 'from', exact: true }).fill(String(first));
    await page.getByRole('textbox', { name: 'to', exact: true }).fill(String(last));
    await page.getByRole('tabpanel').getByRole('button', { name: 'SEARCH NOW' }).click();
    const rows = page.locator('tr[data-toggle="tableWinningNumbers"]');
    await page.waitForFunction(expected => {
      const found = document.querySelector('tr[data-toggle="tableWinningNumbers"] strong');
      return found && found.textContent.match(/\d+/)?.[0] === String(expected);
    }, last, { timeout: 30000 });
    const draws = await rows.evaluateAll(elements => elements.map(tr => {
      const c = tr.querySelectorAll('td');
      return {
        draw_no: Number(c[0].querySelector('strong')?.textContent.match(/\d+/)?.[0]),
        date_time: c[0].querySelector('time')?.textContent.trim(),
        numbers: [...c[1].querySelectorAll('span')].map(n => Number(n.textContent.trim())),
        bullseye: c[2].textContent.trim(), doubleBullseye: c[3].textContent.trim(),
        multiplier: c[4].textContent.trim(), total_winners: c[5].textContent.trim(),
        total_payout: c[6].textContent.trim(),
      };
    }));
    if (draws.length !== last - first + 1 || draws[0]?.draw_no !== last ||
        draws.at(-1)?.draw_no !== first ||
        draws.some((draw, index) => draw.draw_no !== last - index || draw.numbers.length !== 20)) {
      throw new Error(`Incomplete official response for ${first}–${last}: ${draws.length} rows`);
    }
    const output = path.join(dataDir, `official-sample-${first}-${last}.json`);
    await fs.writeFile(output + '.tmp', JSON.stringify(draws));
    await fs.rename(output + '.tmp', output);
    completed++;
    console.log(`Saved ${first}–${last} (${completed}/${windows.length})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally {
  await browser.close();
  if (completed) {
    const files = (await fs.readdir(dataDir)).filter(name => /^official-sample-\d+-\d+\.json$/.test(name)).sort();
    const result = spawnSync('python3', ['quickdraw/scripts/build_history.py',
      ...files.map(name => path.join(dataDir, name))], { stdio: 'inherit' });
    if (result.status !== 0) process.exitCode = result.status || 1;
  }
}
