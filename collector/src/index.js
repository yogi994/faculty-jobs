import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  REGION_KEYWORDS, ROLE_PATTERN, OPENING_PATTERN, SUBJECT_PATTERN, EXCLUDE_PATTERN, BLOCKED_ORGS, PREFERRED_ORGS,
  KEEP_DAYS_AFTER_DEADLINE, KEEP_UNDATED_DAYS, EXCLUDE_QUALIFICATION, OTHER_SUBJECT_PATTERN, OTHER_PLACES_PATTERN,
} from './config.js';
import { freeJobAlert } from './sources/freejobalert.js';
import { googleNews } from './sources/googlenews.js';
import { delhiUniversity } from './sources/delhiuniversity.js';
import { watchlist } from './sources/watchlist.js';
import { facultyFeeds } from './sources/facultyfeeds.js';
import { linkedin } from './sources/linkedin.js';
import { scoreJob } from './match.js';
import { addSeats } from './seats.js';
import { loadInstitutions, refreshReviews, institutionInfo, openingsOf } from './institutions.js';

const DATA_FILE = new URL('../../data/jobs.json', import.meta.url);
const SOURCES = { delhiUniversity, watchlist, freeJobAlert, facultyFeeds, linkedin, googleNews };
const today = new Date().toISOString().slice(0, 10);
const thisYear = new Date().getFullYear();

const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 86400000;
const titleKey = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
// Generic titles ("Assistant Professor") need the institution to tell posts apart.
const jobKey = (j) => titleKey(j.org && !j.title.includes(j.org) && !j.org.includes(j.title) ? `${j.org} ${j.title}` : j.title);

// Several news sites report the same ad with different headlines. Compare the
// distinctive words (org names, post counts) to treat them as one job.
const FILLER = new Set(
  'the a an of for in at on to and or by is are with from out now here check apply online offline link direct details notification recruitment vacancy vacancies posts post assistant professor professors faculty eligibility released begins open opens last date how new see 2025 2026 2027 jobs job walkin walk invites applications application'.split(' '),
);
const wordsOf = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w)));
function similar(a, b) {
  const A = wordsOf(a);
  const B = wordsOf(b);
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.min(A.size, B.size) >= 0.6;
}

function detectRegion(text) {
  const t = ` ${text.toLowerCase()} `;
  return Object.entries(REGION_KEYWORDS).find(([, words]) => words.some((w) => t.includes(w)))?.[0] ?? null;
}

// Decide whether a raw job is relevant; returns the enriched job or null.
function qualify(job) {
  const text = `${job.title} ${job.org} ${job.qualification ?? ''} ${job.summary ?? ''}`;
  if (!job.url || !ROLE_PATTERN.test(job.title)) return null;
  if (job.source === 'Google News' && !OPENING_PATTERN.test(job.title)) return null;
  if (EXCLUDE_PATTERN.test(job.title) || BLOCKED_ORGS.test(text)) return null;
  if (job.qualification && EXCLUDE_QUALIFICATION.test(job.qualification)) return null;
  if (OTHER_SUBJECT_PATTERN.test(job.title) && !SUBJECT_PATTERN.test(job.title)) return null;
  if (OTHER_PLACES_PATTERN.test(job.title)) return null;

  // Skip old notices: if the title mentions years, the latest must be this year or later.
  const years = (job.title.match(/\b20\d{2}\b/g) ?? []).map(Number);
  if (years.length && Math.max(...years) < thisYear) return null;
  // Notices often carry a date (02.06.2026, 15-05-2026); skip ones dated long ago.
  const dates = [...job.title.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g)]
    .map(([, d, m, y]) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
    .filter((d) => !Number.isNaN(new Date(d).getTime()));
  if (dates.length && daysBetween(dates.sort().at(-1), today) > KEEP_UNDATED_DAYS) return null;

  let region = detectRegion(`${job.title} ${job.org}`) ?? (job.sourceState === 'uttar pradesh' ? null : job.region);
  if (!region) region = detectRegion(text);
  if (!region) return null;

  const enriched = {
    ...job,
    region,
    subjectMatch: SUBJECT_PATTERN.test(text),
    // Delhi colleges in these listings are almost always DU colleges.
    preferred: PREFERRED_ORGS.test(text) || (region === 'Delhi' && /college|mahavidyalaya/i.test(job.title)),
  };
  return { ...enriched, ...scoreJob(enriched) };
}

// A notice hosted on another university's site belongs to a different ad.
const baseDomain = (u) => {
  const parts = new URL(u).hostname.replace(/^www\./, '').split('.');
  return parts.slice(/\.(ac|edu|gov|nic|co)\.in$/.test(new URL(u).hostname) ? -3 : -2).join('.');
};
function sameInstitution(pdf, website) {
  try {
    const host = new URL(pdf).hostname;
    if (!/\.(ac\.in|edu|edu\.in)$/.test(host) || !website) return true;
    return baseDomain(pdf) === baseDomain(website);
  } catch {
    return false;
  }
}

function isExpired(job) {
  if (job.lastDate) return daysBetween(job.lastDate, today) > KEEP_DAYS_AFTER_DEADLINE;
  return daysBetween(job.postedAt ?? job.firstSeen, today) > KEEP_UNDATED_DAYS;
}

async function notify(newJobs) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic || !newJobs.length) return;
  const top = [...newJobs].sort((a, b) => b.matchScore - a.matchScore);
  const lines = top.slice(0, 8).map((j) => `• ${j.matchScore}% · ${j.title}${j.org && j.org !== j.title ? `, ${j.org}` : ''}${j.lastDate ? ` (last date ${j.lastDate})` : ''}`);
  if (top.length > 8) lines.push(`…and ${top.length - 8} more`);
  const res = await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: {
      Title: `${newJobs.length} new Assistant Professor opening${newJobs.length > 1 ? 's' : ''}`,
      Tags: 'mortar_board',
      ...(top[0].matchScore >= 70 ? { Priority: 'high' } : {}),
    },
    body: lines.join('\n'),
  });
  console.log(`Notification sent: ${res.status}`);
}

async function main() {
  let existing = [];
  try {
    existing = JSON.parse(await readFile(DATA_FILE, 'utf8')).jobs ?? [];
  } catch {}
  const known = new Map(existing.map((j) => [j.id, j]));
  const knownTitles = new Set(existing.map((j) => jobKey(j)));
  const firstRun = existing.length === 0;

  const results = await Promise.allSettled(Object.values(SOURCES).map((fn) => fn()));
  const sourceStatus = {};
  const raw = [];
  Object.keys(SOURCES).forEach((name, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      raw.push(...r.value);
      sourceStatus[name] = { ok: true, count: r.value.length };
    } else {
      sourceStatus[name] = { ok: false, error: r.reason.message };
      console.warn(`Source ${name} failed: ${r.reason.message}`);
    }
  });

  const fresh = new Map();
  const seenTitles = new Set();
  for (const r0 of raw) {
    // A failed fetch (e.g. LinkedIn rate limit) shouldn't wipe text we already have.
    const before = known.get(createHash('sha1').update(r0.url ?? '').digest('hex').slice(0, 12));
    const r = before
      ? { ...r0, details: r0.details || before.details, applyUrl: r0.applyUrl ?? before.applyUrl, applyEmail: r0.applyEmail ?? before.applyEmail }
      : r0;
    const job = qualify(r);
    if (!job) continue;
    const id = createHash('sha1').update(job.url).digest('hex').slice(0, 12);
    const tk = jobKey(job);
    if (fresh.has(id) || seenTitles.has(tk)) continue;
    // Prefer structured listings over news: sources run in that order, so a
    // news item similar to anything already kept is a repeat.
    const repeat = [...fresh.values(), ...existing].find(
      (k) => k.id !== id && k.region === job.region && similar(k.title, job.title),
    );
    if (repeat) continue;
    seenTitles.add(tk);
    const prev = known.get(id);
    fresh.set(id, { ...job, id, firstSeen: prev?.firstSeen ?? today });
  }

  // Keep previously found jobs that are still within their window, even if a
  // source failed or the listing scrolled off.
  // Re-check them so filter changes also clean up older entries.
  for (const j of existing) {
    if (fresh.has(j.id)) continue;
    const still = qualify(j);
    if (still) fresh.set(j.id, { ...still, id: j.id, firstSeen: j.firstSeen });
  }

  const kept = [...fresh.values()]
    .filter((j) => !isExpired(j))
    .sort((a, b) => (b.firstSeen + (b.postedAt ?? '')).localeCompare(a.firstSeen + (a.postedAt ?? '')));

  // Employer website, reviews and number of posts for each card.
  const inst = await loadInstitutions();
  await refreshReviews(inst, kept).catch((err) => console.warn(`Reviews skipped: ${err.message}`));
  const withInfo = kept.map((j) => ({ ...j, openings: openingsOf(j), institution: institutionInfo(inst, j) }));
  // Commerce/Management seats by reservation category, from the ad and its notification PDF.
  const seated = await addSeats(withInfo).catch((err) => {
    console.warn(`Seats skipped: ${err.message}`);
    return withInfo;
  });
  // Seats in Commerce/Management confirm the subject even when the title doesn't name it.
  const jobs = seated.map((job) => {
    let j = job;
    const subjects = j.seats?.subjects?.map((x) => x.subject) ?? [];
    j = { ...j, notices: (j.notices ?? []).filter((n) => sameInstitution(n.url, j.institution?.website)) };
    if (!subjects.length) return j;
    return { ...j, subjectMatch: true, ...scoreJob(j) };
  }).filter((j) => !isExpired(j)); // the notice may reveal a deadline that has passed

  const newJobs = jobs.filter((j) => !known.has(j.id) && !knownTitles.has(jobKey(j)));
  await writeFile(DATA_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), sourceStatus, jobs }, null, 2) + '\n');
  console.log(`Raw ${raw.length} -> kept ${jobs.length} jobs, ${newJobs.length} new.`);
  console.table(sourceStatus);

  // Don't flood the phone with everything on the very first run.
  if (!firstRun) await notify(newJobs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
