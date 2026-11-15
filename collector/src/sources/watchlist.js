import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';
import { fetchText, clean } from '../http.js';

// Official recruitment pages of chosen institutions. Each page is scanned for
// links that look like faculty recruitment notices; a link not seen before is
// a new notice.
const LINK_PATTERN = /recruit|advert|advt|vacanc|faculty|teaching|assistant\s*prof|professor|walk.?in|position|opening/i;
const SKIP_PATTERN = /non[- ]?teaching|result|answer key|admit card|tender|login|register|archive/i;
const SEEN_FILE = new URL('../../../data/official-seen.json', import.meta.url);
const thisYear = new Date().getFullYear();
const CURRENT_YEAR = new RegExp(`\\b(${thisYear}|${thisYear + 1})\\b`);

export async function watchlist() {
  const list = JSON.parse(await readFile(new URL('../../watchlist.json', import.meta.url), 'utf8'));
  let seen = {};
  try {
    seen = JSON.parse(await readFile(SEEN_FILE, 'utf8'));
  } catch {}

  const jobs = [];
  const errors = [];
  await Promise.all(
    list
      .filter((s) => s.status === 'ok')
      .map(async (site) => {
        let html;
        try {
          html = await fetchText(site.url);
        } catch (err) {
          errors.push(`${site.name}: ${err.message}`);
          return;
        }
        const $ = cheerio.load(html);
        const baseline = !seen[site.url];
        const known = new Set(seen[site.url] ?? []);
        const links = new Map();
        $('a[href]').each((_, a) => {
          const text = clean($(a).text()) || clean($(a).attr('title'));
          const href = $(a).attr('href');
          if (!text || text.length < 12 || !href || /^(#|javascript|mailto)/i.test(href)) return;
          if (!LINK_PATTERN.test(text) || SKIP_PATTERN.test(text)) return;
          try {
            links.set(new URL(href, site.url).toString(), text.slice(0, 200));
          } catch {}
        });
        for (const [url, text] of links) {
          // First scan of a site: only notices that name this or next year,
          // so years-old links already on the page don't show up as new.
          if (baseline ? !CURRENT_YEAR.test(text) : known.has(url)) continue;
          jobs.push({
            source: 'Official site',
            title: text,
            org: site.name,
            url,
            region: site.region,
            postedAt: null,
            lastDate: null,
            official: true,
          });
        }
        seen[site.url] = [...new Set([...known, ...links.keys()])];
      }),
  );
  await writeFile(SEEN_FILE, JSON.stringify(seen, null, 1) + '\n');
  if (errors.length) console.warn(`Watchlist: ${errors.length} site(s) failed:\n  ` + errors.join('\n  '));
  return jobs;
}
