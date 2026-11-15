import * as cheerio from 'cheerio';
import { fetchText, clean } from '../http.js';
import { REGION_KEYWORDS } from '../config.js';

// LinkedIn's public (logged-out) job search. No account is used.
// Each search returns up to ~10 recent posts; we then read the full
// description of the relevant ones so they can be scored.
const KEYWORDS = ['Assistant Professor Commerce', 'Assistant Professor Management', 'Assistant Professor Finance'];
const LOCATIONS = [
  'Gurugram, Haryana, India',
  'New Delhi, Delhi, India',
  'Noida, Uttar Pradesh, India',
  'Faridabad, Haryana, India',
  'Haryana, India',
  'Rajasthan, India',
];
const PAST_SECONDS = 30 * 24 * 3600; // posted in the last 30 days
const MAX_DESCRIPTIONS = 40;

const BASE = 'https://www.linkedin.com/jobs-guest/jobs/api';
const regionOf = (loc) => {
  const t = ` ${loc.toLowerCase()} `;
  return Object.entries(REGION_KEYWORDS).find(([, words]) => words.some((w) => t.includes(w)))?.[0] ?? null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Only fetch descriptions for posts that are actually Assistant Professor roles.
const ROLE = /assistant\s*(\/\s*associate\s*)?prof|asst\.?\s*prof/i;

async function search(keywords, location) {
  const qs = new URLSearchParams({ keywords, location, f_TPR: `r${PAST_SECONDS}` });
  const $ = cheerio.load(await fetchText(`${BASE}/seeMoreJobPostings/search?${qs}`));
  return $('li')
    .map((_, li) => {
      const card = $(li);
      const id = card.find('[data-entity-urn]').attr('data-entity-urn')?.split(':').pop();
      const title = clean(card.find('.base-search-card__title').text());
      if (!id || !title) return null;
      return {
        linkedinId: id,
        title,
        org: clean(card.find('.base-search-card__subtitle').text()),
        location: clean(card.find('.job-search-card__location').text()),
        postedAt: card.find('time').attr('datetime') ?? null,
      };
    })
    .get()
    .filter(Boolean);
}

// Pulls the ad text plus every way to apply that the public page reveals.
async function posting(id) {
  const html = await fetchText(`${BASE}/jobPosting/${id}`);
  const $ = cheerio.load(html);
  // Put a space at every tag boundary so words in separate lines don't run together.
  const markup = ($('.show-more-less-html__markup').html() ?? '').replace(/<[^>]+>/g, ' $& ');
  const text = clean(cheerio.load(`<div>${markup}</div>`)('div').text());

  // Off-site applications carry the employer's link in a hidden <code id="applyUrl"> comment.
  let applyUrl = null;
  const raw = html.match(/id="applyUrl"[^>]*>\s*<!--\s*"([^"]+)"/)?.[1];
  if (raw) {
    try {
      const u = new URL(raw.replace(/&amp;/g, '&'));
      applyUrl = u.searchParams.get('url') ?? u.toString();
    } catch {}
  }
  // Otherwise the ad text often names an email address or the institution's careers page.
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.replace(/\.$/, '') ?? null;
  if (!applyUrl) {
    const site = text.match(/https?:\/\/[^\s,)]+|www\.[^\s,)]+/)?.[0]?.replace(/[.;:]$/, '');
    if (site) applyUrl = site.startsWith('http') ? site : `https://${site}`;
  }
  return { text, applyUrl, applyEmail: email };
}

export async function linkedin() {
  const cards = new Map();
  for (const k of KEYWORDS) {
    for (const loc of LOCATIONS) {
      try {
        for (const c of await search(k, loc)) if (!cards.has(c.linkedinId)) cards.set(c.linkedinId, c);
      } catch (err) {
        console.warn(`LinkedIn search "${k}" / ${loc} failed: ${err.message}`);
      }
      await sleep(1500); // be gentle; LinkedIn rate-limits fast clients
    }
  }
  if (!cards.size) throw new Error('LinkedIn returned no results (possibly rate-limited)');

  const relevant = [...cards.values()].filter((c) => ROLE.test(c.title)).slice(0, MAX_DESCRIPTIONS);
  const jobs = [];
  for (const c of relevant) {
    let text = '';
    let applyUrl = null;
    let applyEmail = null;
    try {
      ({ text, applyUrl, applyEmail } = await posting(c.linkedinId));
    } catch (err) {
      console.warn(`LinkedIn job ${c.linkedinId} description failed: ${err.message}`);
    }
    jobs.push({
      source: 'LinkedIn',
      title: c.title,
      org: c.org,
      url: `https://www.linkedin.com/jobs/view/${c.linkedinId}`,
      region: regionOf(c.location),
      location: c.location,
      postedAt: c.postedAt,
      lastDate: null,
      summary: c.location,
      // Full ad text, used for the resume match score (not for filtering).
      details: text.slice(0, 2500),
      // Without these, applying means LinkedIn Easy Apply (needs her login).
      applyUrl,
      applyEmail,
    });
    await sleep(1000);
  }
  return jobs;
}
