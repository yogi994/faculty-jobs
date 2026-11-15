import { XMLParser } from 'fast-xml-parser';
import { fetchText, clean } from '../http.js';

// Google News search covers job sites and news reports from across the web.
const QUERIES = [
  '"assistant professor" commerce recruitment',
  '"assistant professor" management recruitment Delhi',
  '"assistant professor" recruitment Haryana',
  '"assistant professor" recruitment Rajasthan',
  '"assistant professor" recruitment Jaipur',
  '"assistant professor" recruitment Gurugram OR Gurgaon OR Faridabad',
  '"assistant professor" recruitment Noida OR Ghaziabad OR Meerut',
  'faculty recruitment commerce management university Delhi NCR',
  'HPSC assistant professor',
  'RPSC assistant professor',
  'UPESSC assistant professor',
  'Delhi University college assistant professor commerce',
];

const feedUrl = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:30d')}&hl=en-IN&gl=IN&ceid=IN:en`;

const parser = new XMLParser();

export async function googleNews() {
  const jobs = [];
  for (const q of QUERIES) {
    try {
      const xml = await fetchText(feedUrl(q));
      const items = [].concat(parser.parse(xml)?.rss?.channel?.item ?? []);
      for (const it of items) {
        // Titles look like "Headline - Publisher"
        const full = clean(String(it.title ?? ''));
        const cut = full.lastIndexOf(' - ');
        const title = cut > 0 ? full.slice(0, cut) : full;
        const publisher = cut > 0 ? full.slice(cut + 3) : '';
        jobs.push({
          source: 'Google News',
          title,
          org: publisher,
          url: it.link,
          region: null,
          postedAt: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : null,
          lastDate: null,
          query: q,
        });
      }
    } catch (err) {
      console.warn(`Google News query failed (${q}): ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return jobs;
}
