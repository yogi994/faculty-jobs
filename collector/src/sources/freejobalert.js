import * as cheerio from 'cheerio';
import { fetchText, clean } from '../http.js';

// FreeJobAlert's teaching page has one table per state, each under a heading.
const URL = 'https://www.freejobalert.com/teaching-faculty-jobs/';
const STATE_TO_REGION = {
  delhi: 'Delhi',
  haryana: 'Haryana',
  rajasthan: 'Rajasthan',
  'uttar pradesh': 'UP-NCR', // filtered to NCR districts later
  'all india teaching jobs': null,
};

// "02/11/2026" or "22-11-2026" -> "2026-11-02"
function toIso(d) {
  const m = d && d.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

export async function freeJobAlert() {
  const $ = cheerio.load(await fetchText(URL));
  const jobs = [];
  $('table').each((_, table) => {
    const heading = clean($(table).prevAll('h2, h3, h4').first().text()).toLowerCase();
    if (!(heading in STATE_TO_REGION)) return;
    $(table)
      .find('tr')
      .each((_, tr) => {
        const td = (cls) => clean($(tr).find(`td.${cls}`).text());
        const org = td('latcr');
        const post = td('latceb');
        if (!org || !post) return;
        const link = $(tr).find('td.latcmb a').attr('href');
        jobs.push({
          source: 'FreeJobAlert',
          title: `${org}: ${post}`,
          org,
          url: link,
          region: STATE_TO_REGION[heading],
          sourceState: heading,
          postedAt: toIso(td('latcpb')),
          lastDate: toIso(td('latclb')),
          qualification: td('latcqb'),
          advtNo: td('latcab'),
        });
      });
  });
  return jobs;
}
