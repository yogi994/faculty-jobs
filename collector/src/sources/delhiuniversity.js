import * as cheerio from 'cheerio';
import { fetchText, clean } from '../http.js';

// DU's recruitment portal lists each college's active teaching ad as
// "Assistant Professor – <College> [NEW] <Advt No> · <DD-MM-YYYY>".
const BASE = 'https://rec.uod.ac.in';
const HOME = `${BASE}/`;

export async function delhiUniversity() {
  const $home = cheerio.load(await fetchText(HOME));
  const href = $home('a')
    .filter((_, a) => /advertisement details/i.test($home(a).text()))
    .attr('href');
  if (!href) throw new Error('DU: "Advertisement Details" link not found');
  const pageUrl = new URL(href, BASE).toString();
  const $ = cheerio.load(await fetchText(pageUrl));

  // Flatten to text pieces and read only the active "Teaching Posts" section.
  const pieces = [];
  $('body *').each((_, el) => {
    const own = clean($(el).contents().filter((_, n) => n.type === 'text').text());
    if (own) pieces.push(own);
  });
  const start = pieces.findIndex((p) => /^teaching posts$/i.test(p));
  const end = pieces.findIndex((p, i) => i > start && /^archived/i.test(p));
  const section = start >= 0 ? pieces.slice(start + 1, end > 0 ? end : undefined) : [];

  const jobs = [];
  for (let i = 0; i < section.length; i++) {
    const m = section[i].match(/^(assistant professor|associate professor|professor)\s*[–-]\s*(.+)$/i);
    if (!m) continue;
    // The advt no + date sit in one of the next two pieces.
    const meta = section.slice(i + 1, i + 3).find((p) => /\d{2}-\d{2}-\d{4}/.test(p)) ?? '';
    const [advtNo, date] = meta.split(/·|&middot;/).map((s) => clean(s));
    const d = date?.match(/(\d{2})-(\d{2})-(\d{4})/);
    jobs.push({
      source: 'DU Recruitment Portal',
      title: `${m[1]} - ${m[2]}`,
      org: `${m[2]} (University of Delhi)`,
      url: pageUrl,
      region: 'Delhi',
      postedAt: d ? `${d[3]}-${d[2]}-${d[1]}` : null,
      lastDate: null,
      advtNo: advtNo || null,
    });
  }
  return jobs;
}
