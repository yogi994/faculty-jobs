import { readFile, writeFile } from 'node:fs/promises';
import { fetchText } from './http.js';

// Institution facts for the app: official website, government or private,
// and employee reviews from AmbitionBox (India's largest employer-review site).
// Ratings come from Assistant Professors' own reviews when there are enough,
// otherwise from all staff. Reviews are cached for a week.

const LIST_FILE = new URL('../institutions.json', import.meta.url);
const CACHE_FILE = new URL('../../data/reviews.json', import.meta.url);
const REFRESH_DAYS = 7;
const MIN_FACULTY_REVIEWS = 5;
const AB = 'https://www.ambitionbox.com/reviews';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : null);

function pageData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]).props?.pageProps : null;
}

// Short, readable quotes; skips "nothing", "na" and very long rants.
function quotes(reviews, field) {
  const seen = new Set();
  return reviews
    .map((r) => (r[field] ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 25 && t.length <= 220 && !/^(nothing|na|n\/a|none|no)\b/i.test(t))
    .filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, 3);
}

async function fetchReviews(slug) {
  let scope = 'Assistant Professors';
  let url = `${AB}/${slug}-reviews/assistant-professor`;
  let pp = pageData(await fetchText(url));
  if (!pp || (pp.reviewCount ?? 0) < MIN_FACULTY_REVIEWS || pp.jobProfileName !== 'Assistant Professor') {
    scope = 'all staff';
    url = `${AB}/${slug}-reviews`;
    await sleep(800);
    pp = pageData(await fetchText(url));
  }
  if (!pp?.ratingsData) throw new Error('no ratings on page');
  const r = pp.ratingsData;
  const ai = pp.reviewAISummary ?? {};
  const reviews = [...(pp.reviewsData ?? []), ...(pp.latestReviewsData ?? [])];
  return {
    source: 'AmbitionBox',
    url,
    scope,
    count: pp.reviewCount ?? null,
    overall: round(r.overallCompanyRating),
    culture: round(r.companyCultureRating),
    workLife: round(r.workLifeRating),
    jobSecurity: round(r.jobSecurityRating),
    salary: round(r.compensationBenefitsRating),
    careerGrowth: round(r.careerGrowthRating),
    skillDevelopment: round(r.skillDevelopmentRating),
    praised: (ai.positives ?? []).map((x) => x.title).slice(0, 4),
    criticised: (ai.negatives ?? []).map((x) => x.title).slice(0, 4),
    likes: quotes(reviews, 'likesText'),
    dislikes: quotes(reviews, 'disLikesText'),
  };
}

export async function loadInstitutions() {
  const list = JSON.parse(await readFile(LIST_FILE, 'utf8')).map((i) => ({ ...i, re: new RegExp(i.match, 'i') }));
  let cache = {};
  try {
    cache = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
  } catch {}
  return { list, cache };
}

// Refresh stale review entries for the institutions that have open jobs.
export async function refreshReviews({ list, cache }, jobs) {
  const now = Date.now();
  const needed = new Set(jobs.map((j) => matchInstitution(list, j)?.ambitionbox).filter(Boolean));
  let fetched = 0;
  for (const slug of needed) {
    const c = cache[slug];
    if (c && now - new Date(c.fetchedAt).getTime() < REFRESH_DAYS * 86400000) continue;
    try {
      cache[slug] = { ...(await fetchReviews(slug)), fetchedAt: new Date().toISOString() };
      fetched++;
    } catch (err) {
      console.warn(`Reviews for ${slug} failed (keeping old copy): ${err.message}`);
    }
    await sleep(1200);
  }
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');
  console.log(`Reviews: ${needed.size} institutions, ${fetched} refreshed.`);
}

export function matchInstitution(list, job) {
  const t = `${job.org ?? ''} ${job.title}`;
  return list.find((i) => i.re.test(t)) ?? null;
}

// What the app shows about the employer.
export function institutionInfo({ list, cache }, job) {
  const inst = matchInstitution(list, job);
  if (!inst) return null;
  const { fetchedAt, ...reviews } = cache[inst.ambitionbox] ?? {};
  return {
    name: inst.name,
    website: inst.website,
    type: inst.type,
    note: inst.note ?? null,
    reviews: reviews.overall ? reviews : null,
  };
}

// Number of posts, when the ad states it ("68 Posts", "Vacancies: 12").
export function openingsOf(job) {
  const t = `${job.title} ${job.summary ?? ''} ${job.details ?? ''}`;
  const m =
    t.match(/\b(\d{1,4})\s*(?:\+\s*)?(?:posts?|vacanc(?:y|ies)|positions?|openings?)\b/i) ??
    t.match(/\b(?:no\.?\s*of\s*(?:posts?|vacanc(?:y|ies))|posts?|vacanc(?:y|ies))\s*[:\-–]\s*(\d{1,4})\b/i);
  const n = m ? Number(m[1]) : null;
  return n && n > 0 && n < 2000 ? n : null;
}
