/** Collect NJ Lottery scratch-off top-prize locations and retailer search results. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('scratchoffs/data');
await fs.mkdir(root, { recursive: true });
const catalogUrl = 'https://www.njlottery.com/en-us/scratch-offs.html';
const retailerUrl = 'https://www.njlottery.com/en-us/playertools/retailer.html';
const seeds = ['Jersey City','Hackensack','Paterson','Morristown','Newark','Elizabeth','Edison','New Brunswick','Princeton','Trenton','Freehold','Asbury Park','Toms River','Camden','Cherry Hill','Atlantic City','Vineland','Bridgeton','Salem','Cape May','Phillipsburg','Newton'];
const maxGames = Number(process.env.SCRATCH_MAX_GAMES || 5000);
const maxRetailerSearches = Number(process.env.SCRATCH_MAX_SEARCHES || seeds.length);
const now = new Date().toISOString();
const read = async (name, fallback) => JSON.parse(await fs.readFile(path.join(root, name), 'utf8').catch(() => JSON.stringify(fallback)));
const save = async (name, data) => {
  const dest = path.join(root, name);
  await fs.writeFile(dest + '.tmp', JSON.stringify(data));
  await fs.rename(dest + '.tmp', dest);
};
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const key = (address, town) => `${clean(address).toUpperCase()}|${clean(town).toUpperCase()}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const games = await read('games.json', { updated_at: null, entries: [] });
const retailers = await read('retailers.json', { updated_at: null, search_areas: [], entries: [] });

try {
  await page.goto(catalogUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const catalog = new Map();
  for (const status of ['active','ended','expired']) {
    await page.getByRole('tab', { name: status, exact: true }).click();
    await page.waitForFunction(name => {
      const panel = document.querySelector(`[role="tabpanel"][id="${name}"]`);
      return panel && getComputedStyle(panel).display !== 'none' &&
        panel.querySelectorAll('a[href*="/scratch-offs/0"]').length > 0;
    }, status, { timeout:30000 });
    const entries = await page.locator(`[role="tabpanel"][id="${status}"] a[href*="/scratch-offs/0"]`).evaluateAll(links =>
      [...new Set(links.map(a => a.getAttribute('href')))].filter(h => /\/0\d{4}\.html$/.test(h)));
    for (const href of entries) catalog.set(href.match(/(0\d{4})\.html$/)[1], { id: href.match(/(0\d{4})\.html$/)[1], status, url: new URL(href, catalogUrl).href });
    console.log(status, entries.length);
  }
  const byId = new Map(games.entries.map(g => [g.id, g]));
  let scanned = 0;
  for (const game of catalog.values()) {
    if (scanned >= maxGames) break;
    const old = byId.get(game.id);
    // The full active/ended catalog refreshes; expired games are historical and stable.
    if (game.status === 'expired' && old?.scanned_at) continue;
    await page.goto(game.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => {
      const tables = [...document.querySelectorAll('table')];
      return [...document.querySelectorAll('h2')].some(h => / - \$/.test(h.textContent)) &&
        tables.some(t => /Prize Amount/i.test(t.querySelector('th')?.textContent || '') && t.querySelectorAll('tbody tr').length);
    }, null, { timeout: 30000 });
    const item = await page.evaluate(() => {
      const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const heading = [...document.querySelectorAll('h2')].find(h => / - \$/.test(txt(h)));
      const tables = [...document.querySelectorAll('table')];
      const rows = table => [...(table?.querySelectorAll('tbody tr') || [])].map(tr => [...tr.querySelectorAll('td')].map(txt));
      const prize = tables.find(t => /Prize Amount/i.test(txt(t.querySelector('th'))));
      const lucky = tables.find(t => /Retailer/i.test(txt(t.querySelector('th'))) && /Town/i.test(txt(t)));
      const cells = rows(prize).filter(r => r.length >= 3 && /\d/.test(r[0]));
      const locations = rows(lucky).filter(r => r.length >= 4).map(r => ({ retailer:r[0], address:r[1], town:r[2], amount:r[3], closed:/\*\*/.test(r[0]) }));
      return {
        name:txt(heading).replace(/\s+-\s+\$.*$/, ''),
        ticket_price:Number(txt(heading).match(/ - \$\s*([\d.]+)/)?.[1] || 0),
        top_prize:txt(document.querySelector('main') || document.body).match(/TOP PRIZE\s+([^\n]+?)\s+TICKET PRICE/)?.[1]?.slice(0,40) || cells[0]?.[0] || '',
        start_date:txt(document.querySelector('time')),
        prize_levels:cells.map(r => ({ amount:r[0], total:Number(r[1].replace(/,/g,'')), remaining:Number(r[2].replace(/,/g,'')) })),
        locations,
        pagination:[...document.querySelectorAll('a[href*="/api/v1/locations/luckylocations/page"]')].map(a => a.getAttribute('href')),
      };
    });
    if (!item.name || !item.prize_levels.length) {
      console.warn(`Skipping incomplete game ${game.id}; title=${JSON.stringify(item.name)}, prize rows=${item.prize_levels.length}`);
      continue;
    }
    // Pagination is shown for games with more than twenty winning locations.
    const pages = new Set(item.pagination);
    for (const href of pages) {
      const p = Number(new URL(href, game.url).searchParams.get('page'));
      if (!p) continue;
      await page.locator(`a[href="${href}"]`).click();
      await page.waitForFunction(want => {
        const active = [...document.querySelectorAll('a[href*="/api/v1/locations/luckylocations/page"]')].find(a => a.classList.contains('active'));
        return active ? Number(new URL(active.href).searchParams.get('page')) === want : true;
      }, p).catch(() => {});
      const extra = await page.evaluate(() => {
        const table = [...document.querySelectorAll('table')].find(t => /Retailer/i.test(t.querySelector('th')?.textContent || '') && /Town/i.test(t.textContent));
        return [...(table?.querySelectorAll('tbody tr') || [])].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())).filter(r => r.length >= 4).map(r => ({ retailer:r[0], address:r[1], town:r[2], amount:r[3], closed:/\*\*/.test(r[0]) }));
      });
      item.locations.push(...extra);
    }
    delete item.pagination;
    item.locations = [...new Map(item.locations.map(w => [`${key(w.address,w.town)}|${w.amount}`,w])).values()];
    byId.set(game.id, { ...game, ...item, scanned_at: now });
    games.entries = [...byId.values()].sort((a,b) => b.id.localeCompare(a.id));
    games.updated_at = now;
    await save('games.json', games);
    scanned++;
    console.log(`game ${game.id}: ${item.locations.length} top prize locations`);
  }

  await page.goto(retailerUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const byStore = new Map(retailers.entries.map(r => [key(r.address,r.town),r]));
  const searched = new Set(retailers.search_areas.filter(a => a.complete).map(a => a.name));
  let searches = 0;
  for (const city of seeds) {
    if (searched.has(city) || searches >= maxRetailerSearches) continue;
    await page.getByPlaceholder('ENTER ZIP CODE OR CITY').fill(city);
    await page.getByRole('main').getByRole('combobox').selectOption({ label:'30 Miles' });
    await page.getByRole('main').getByRole('button', { name:'SEARCH NOW' }).click();
    await page.getByRole('heading', { name:/Display \d+ of \d+/ }).waitFor({ timeout:30000 });
    const total = Number((await page.getByRole('heading', { name:/Display \d+ of \d+/ }).innerText()).match(/of (\d+)/)?.[1]);
    if (!total) throw new Error(`No retailers returned for ${city}`);
    while (await page.getByRole('button', { name:'View more results' }).count()) {
      const before = await page.locator('.retailer.slick-slide:not(.slick-cloned)').count();
      if (before >= total) break;
      try {
        await page.getByRole('button', { name:'View more results' }).click({ force:true, timeout:8000 });
        await page.waitForFunction(n => document.querySelectorAll('.retailer.slick-slide:not(.slick-cloned)').length > n, before, { timeout:8000 });
      } catch (error) {
        console.warn(`Retailer paging paused for ${city} after ${before}/${total}: ${error.message.slice(0,100)}`);
        break;
      }
    }
    const found = await page.locator('.retailer.slick-slide:not(.slick-cloned)').evaluateAll(elements => elements.map(el => {
      const address = [...el.querySelectorAll('.retailer-list-address')].map(x => x.textContent.trim());
      const match = address[1]?.match(/^(.*?),\s*NJ\s*(\d{5})/i);
      return { name:el.querySelector('h4')?.textContent.trim().replace(/^\*\s*/,''), address:address[0], town:match?.[1]?.trim() || '', zip:match?.[2] || '', hangout:!!el.querySelector('.retailer-list-hangout') };
    }).filter(r => r.name && r.address && r.town));
    for (const r of found) byStore.set(key(r.address,r.town),r);
    retailers.entries = [...byStore.values()].sort((a,b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name));
    retailers.search_areas = retailers.search_areas.filter(a => a.name !== city);
    retailers.search_areas.push({ name:city, radius_miles:30, reported:total, collected:found.length, complete:found.length >= total });
    retailers.updated_at = now;
    await save('retailers.json',retailers);
    searched.add(city);
    searches++;
    console.log(`${city}: ${found.length}, unique ${byStore.size}`);
  }
} finally { await browser.close(); }
