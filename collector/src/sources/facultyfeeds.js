import { XMLParser } from 'fast-xml-parser';
import { fetchText, clean } from '../http.js';

// Faculty-job aggregators with RSS feeds. FacultyPlus has one per state.
const FEEDS = [
  { url: 'https://www.facultyplus.com/category/jobs-by-location/delhi/feed/', region: 'Delhi', source: 'FacultyPlus' },
  { url: 'https://www.facultyplus.com/category/jobs-by-location/haryana/feed/', region: 'Haryana', source: 'FacultyPlus' },
  { url: 'https://www.facultyplus.com/category/jobs-by-location/rajasthan/feed/', region: 'Rajasthan', source: 'FacultyPlus' },
  // UP feed covers the whole state; the region is re-detected so only NCR remains.
  { url: 'https://www.facultyplus.com/category/jobs-by-location/uttar-pradesh/feed/', region: null, source: 'FacultyPlus' },
  { url: 'https://facultytick.com/feed/', region: null, source: 'FacultyTick' },
];

const parser = new XMLParser();
const stripHtml = (s) => clean(String(s ?? '').replace(/<[^>]+>/g, ' '));

export async function facultyFeeds() {
  const jobs = [];
  const results = await Promise.allSettled(FEEDS.map((f) => fetchText(f.url)));
  results.forEach((r, i) => {
    const feed = FEEDS[i];
    if (r.status !== 'fulfilled') {
      console.warn(`${feed.source} feed failed: ${r.reason.message}`);
      return;
    }
    const items = [].concat(parser.parse(r.value)?.rss?.channel?.item ?? []);
    for (const it of items) {
      const title = stripHtml(it.title);
      jobs.push({
        source: feed.source,
        title,
        org: title, // feed titles already name the institution
        url: it.link,
        region: feed.region,
        postedAt: it.pubDate ? new Date(it.pubDate).toISOString().slice(0, 10) : null,
        lastDate: null,
        summary: stripHtml(it.description).slice(0, 300),
      });
    }
  });
  return jobs;
}
