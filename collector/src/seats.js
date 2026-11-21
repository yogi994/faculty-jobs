import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import { fetchText } from './http.js';

// Seats for her subjects (Commerce / Management) in each ad, split by
// reservation category (UR, OBC, SC, ST, EWS, ...) when the ad gives it.
// Read from the listing page's tables and from the official notification PDF
// (text PDFs directly; scanned PDFs through OCR, kept only if the numbers add up).

const run = promisify(execFile);
const CACHE_FILE = new URL('../../data/seats.json', import.meta.url);
const RECHECK_DAYS = 7;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const MY_SUBJECT = /commerce|management|business (administration|studies|economics)|\bfinance\b|accountancy|accounting|\bm\.?b\.?a\b|\bb\.?b\.?a\b/i;
const NOT_MINE = /hotel|hospital|hospitality|tourism|disaster|sports|event|fashion|health|agri|forest|water|waste|environment|land|information management|data management|construction/i;
const SENIOR = /associate|(?<!assistant\s)\bprofessor\b(?!.*assistant)/i;
const ASSISTANT = /assistant/i;

// Category spellings used across Haryana, Rajasthan, UP, Delhi and central notices.
const CATS = [
  ['UR', /^(ur|gen|general|unreserved|open|gen\/ur|ur\/gen)$/i],
  ['OBC', /^(obc|obc-?ncl|bc|backward)$/i],
  ['BC-A', /^(bc-?a|bca|bc\(a\))$/i],
  ['BC-B', /^(bc-?b|bcb|bc\(b\))$/i],
  ['MBC', /^mbc$/i],
  ['SC', /^(sc|dsc|osc)$/i],
  ['ST', /^st$/i],
  ['EWS', /^ews$/i],
  ['PwBD', /^(pwbd|pwd|ph|pbd|divyang)$/i],
  ['ESM', /^(esm|xsm|ex-?sm)$/i],
];
const VERTICAL = new Set(['UR', 'OBC', 'BC-A', 'BC-B', 'MBC', 'SC', 'ST', 'EWS']);
// Haryana splits SC into DSC/OSC; keep those names.
const catOf = (tok) => {
  const t = tok.replace(/[\s.]/g, '');
  if (/^dsc$/i.test(t)) return 'DSC';
  if (/^osc$/i.test(t)) return 'OSC';
  return CATS.find(([, re]) => re.test(t))?.[0] ?? null;
};
const isVertical = (c) => VERTICAL.has(c) || c === 'DSC' || c === 'OSC';
const CAT_TOKEN = /\b(UR|GEN|General|Unreserved|OBC(?:-NCL)?|BC-?A|BC-?B|MBC|DSC|OSC|SC|ST|EWS|PwBD|PwD|PH|ESM)\b\s*[-–:=(]\s*(\d{1,3})\)?/gi;

const subjectName = (t) => {
  const m = t.match(MY_SUBJECT)?.[0].toLowerCase() ?? '';
  if (m.startsWith('commerce')) return 'Commerce';
  if (/finance/.test(m)) return 'Finance';
  if (/account/.test(m)) return 'Accounting';
  if (/business|m\.?b\.?a|b\.?b\.?a/.test(m)) return 'Business Administration';
  return 'Management';
};
const mine = (t) => MY_SUBJECT.test(t) && !NOT_MINE.test(t.match(new RegExp(`.{0,25}(${MY_SUBJECT.source}).{0,5}`, 'i'))?.[0] ?? '');

function tokenCats(text) {
  const cats = {};
  for (const [, tok, n] of text.matchAll(CAT_TOKEN)) {
    const c = catOf(tok);
    if (c) cats[c] = (cats[c] ?? 0) + Number(n);
  }
  return Object.keys(cats).length ? cats : null;
}
const verticalSum = (cats) => Object.entries(cats).filter(([c]) => isVertical(c)).reduce((n, [, v]) => n + v, 0);

// ---------- HTML tables ----------
function htmlRows(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('table').each((_, t) => {
    // Heading just before the table says which post it lists.
    let heading = '';
    let el = $(t);
    for (let i = 0; i < 6 && !heading; i++) {
      el = el.prev().length ? el.prev() : el.parent();
      const txt = el.is('h1,h2,h3,h4,h5,p,strong,b') ? el.text().trim() : '';
      if (txt && txt.length < 160) heading = txt;
    }
    const rows = $(t)
      .find('tr')
      .map((_, tr) => [$(tr).find('th,td').map((_, c) => $(c).text().replace(/\s+/g, ' ').trim()).get()])
      .get();
    if (rows.length) out.push({ heading, rows });
  });
  return out;
}

function fromTables(tables) {
  const subjects = [];
  let totals = null;
  for (const { heading, rows } of tables) {
    if (SENIOR.test(heading) && !ASSISTANT.test(heading)) continue;
    const header = rows[0].map((h) => h.toLowerCase());
    // "Category | Posts" tables: one row per category, for the whole ad.
    if (/categor/.test(header[0] ?? '')) {
      const cats = {};
      for (const r of rows.slice(1)) {
        const c = catOf(r[0] ?? '');
        const n = r.slice(1).find((x) => /^\d{1,4}$/.test(x));
        if (c && n) cats[c] = (cats[c] ?? 0) + Number(n);
      }
      if (Object.keys(cats).length >= 2) totals ??= cats;
      continue;
    }
    const catCols = header.map((h) => catOf(h));
    const hasCatCols = catCols.filter(Boolean).length >= 3;
    const postsCol = header.findIndex((h) => /vacanc|no\.? of posts|posts|number|seats|total/.test(h) && !catOf(h));
    for (const r of rows.slice(1)) {
      const line = r.join(' | ');
      if (SENIOR.test(line) && !ASSISTANT.test(line)) continue;
      let cats = null;
      if (hasCatCols) {
        cats = {};
        r.forEach((cell, i) => {
          if (catCols[i] && /^\d{1,3}$/.test(cell)) cats[catCols[i]] = Number(cell);
        });
        if (!Object.keys(cats).length) cats = null;
      }
      cats ??= tokenCats(line);
      const postsCell = postsCol >= 0 ? r[postsCol] : r.filter((c) => /^\d{1,3}$/.test(c)).at(-1);
      const posts = /^\d{1,4}$/.test(postsCell ?? '') ? Number(postsCell) : cats ? verticalSum(cats) || null : null;
      if (/^total/i.test(r[0] ?? '') || /^total/i.test(r[1] ?? '')) {
        if (cats) totals = cats;
        continue;
      }
      if (mine(line) && posts) subjects.push({ subject: subjectName(line), posts, categories: cats });
    }
  }
  return { subjects, totals };
}

// ---------- PDF text (layout mode) ----------
function fromLayoutText(text) {
  const lines = text.split('\n');
  const subjects = [];
  let totals = null;
  let header = null; // categories in column order (+ 'Total' if present)
  let blockStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const words = line.trim().split(/\s+/);
    const headCats = words.map((w) => (/^total$/i.test(w) ? 'Total' : catOf(w))).filter(Boolean);
    if (headCats.filter((c) => c !== 'Total').length >= 3) {
      header = headCats;
      blockStart = i + 1;
      continue;
    }
    if (!header) {
      // Inline style: "Commerce ... 04 ... UR-2, BCA-1, SC-1"
      if (mine(line) && !(SENIOR.test(line) && !ASSISTANT.test(line))) {
        const cats = tokenCats(line);
        if (cats) subjects.push({ subject: subjectName(line), posts: verticalSum(cats), categories: cats });
      }
      continue;
    }
    // A row ends with one number per header column.
    const nums = line.match(/(?:\s+\d{1,3})+\s*$/)?.[0].trim().split(/\s+/).map(Number) ?? [];
    if (nums.length < header.length) {
      if (/^\s*(note|\d+\.\s+[a-z]{4,})/i.test(line) && i - blockStart > 40) header = null;
      continue;
    }
    const vals = nums.slice(-header.length);
    const cats = {};
    header.forEach((c, k) => c !== 'Total' && (cats[c] = vals[k]));
    const total = header.includes('Total') ? vals[header.indexOf('Total')] : verticalSum(cats);
    // The row's wording can wrap over the lines around it.
    const block = lines.slice(blockStart, Math.min(lines.length, i + 4)).join(' ');
    const own = lines.slice(Math.max(blockStart, i - 4), i + 1).join(' ');
    blockStart = i + 1;
    if (/\btotal\b/i.test(line)) {
      totals = cats;
      continue;
    }
    if (!mine(own) && !mine(block.slice(0, 400))) continue;
    if (SENIOR.test(own) && !ASSISTANT.test(own)) continue;
    if (verticalSum(cats) !== total) continue; // columns didn't line up
    subjects.push({ subject: subjectName(mine(own) ? own : block), posts: total, categories: cats });
  }
  return { subjects, totals };
}

// ---------- fetching ----------
async function download(url, file) {
  await run('curl', ['-sSL', '--fail', '--max-time', '60', '-A', UA, '-o', file, url]);
}

async function pdfText(url, dir) {
  const file = join(dir, `n${Math.random().toString(36).slice(2)}.pdf`);
  await download(url, file);
  const head = (await readFile(file)).subarray(0, 5).toString();
  if (head !== '%PDF-') throw new Error('not a PDF (blocked or moved)');
  const { stdout } = await run('pdftotext', ['-layout', file, '-'], { maxBuffer: 20 * 1024 * 1024 });
  if (stdout.replace(/\s/g, '').length > 300) return { text: stdout, ocr: false };
  // Scanned notice: OCR the first pages, where the vacancy table always is.
  const prefix = file.replace(/\.pdf$/, '');
  await run('pdftoppm', ['-r', '220', '-f', '1', '-l', '6', '-png', file, prefix]);
  let text = '';
  for (let p = 1; p <= 6; p++) {
    for (const name of [`${prefix}-${p}.png`, `${prefix}-0${p}.png`, `${prefix}-00${p}.png`]) {
      try {
        const { stdout: t } = await run('tesseract', [name, '-', '--psm', '6'], { maxBuffer: 10 * 1024 * 1024 });
        text += `${t}\n`;
        break;
      } catch {}
    }
  }
  return { text, ocr: true };
}

function pdfLinks(html, base) {
  const $ = cheerio.load(html);
  const links = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    const label = $(a).text();
    if (!/\.pdf(\?|$)/i.test(href)) return;
    if (/fee|syllabus|form|annex|corrigend|extension|result/i.test(`${label} ${href}`)) return;
    try {
      links.push(new URL(href, base).toString());
    } catch {}
  });
  return [...new Set(links)].slice(0, 2);
}

function merge(results) {
  const by = new Map();
  let totals = null;
  let ocr = false;
  for (const r of results) {
    totals ??= r.totals;
    ocr ||= r.ocr && r.subjects.length > 0;
    for (const s of r.subjects) {
      const k = s.subject;
      if (!by.has(k)) by.set(k, { ...s, categories: s.categories ? { ...s.categories } : null });
      else if (r.source === by.get(k).source) {
        const cur = by.get(k);
        cur.posts += s.posts;
        if (s.categories) {
          cur.categories ??= {};
          for (const [c, n] of Object.entries(s.categories)) cur.categories[c] = (cur.categories[c] ?? 0) + n;
        }
      }
      by.get(k).source ??= r.source;
    }
  }
  // An OCR read is only trusted when its categories add up to its post count.
  const subjects = [...by.values()].map(({ source, ...s }) => {
    if (s.categories && verticalSum(s.categories) !== s.posts) s.categories = null;
    return s;
  });
  return subjects.length || totals ? { subjects, totals, ocr } : null;
}

async function seatsFor(job, dir) {
  const results = [];
  const isPdf = /\.pdf(\?|$)/i.test(job.url);
  const pdfs = [];
  if (isPdf) pdfs.push(job.url);
  else if (!/news\.google\.com|linkedin\.com/.test(job.url)) {
    const html = await fetchText(job.url);
    results.push({ ...fromTables(htmlRows(html)), source: 'page', ocr: false });
    pdfs.push(...pdfLinks(html, job.url));
  }
  if (job.details) results.push({ subjects: [], totals: null, ...pickInline(job.details), source: 'page', ocr: false });
  const notices = [];
  const deadlines = [];
  for (const url of pdfs) {
    try {
      const { text, ocr } = await pdfText(url, dir);
      results.push({ ...fromLayoutText(text), source: url, ocr });
      notices.push({ url, inApp: true });
      deadlines.push(...lastDates(text));
    } catch (err) {
      // Sites behind bot checks block Google's viewer too; the phone's browser gets through.
      notices.push({ url, inApp: false });
      console.warn(`Seats: ${url}: ${err.message.split('\n')[0].slice(0, 120)}`);
    }
  }
  // Prefer the official notice over the listing page.
  results.sort((a, b) => (a.source === 'page') - (b.source === 'page'));
    const lastDate = deadlines.sort().at(-1) ?? null;
  return { seats: merge(results), notices, lastDate };
}

// "on or before 13.07.2026", "Last date: 16-12-2026", "latest by 17/07/2026"
function lastDates(text) {
  const out = [];
  const re = /(?:last date|on or before|latest by|closing date|up ?to)[^0-9\n]{0,60}(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/gi;
  for (const [, d, m, y] of text.matchAll(re)) {
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    if (!Number.isNaN(new Date(iso).getTime()) && +m <= 12) out.push(iso);
  }
  return out;
}

function pickInline(text) {
  const subjects = [];
  for (const sentence of text.split(/(?<=[.;\n])\s+/)) {
    if (!mine(sentence)) continue;
    const cats = tokenCats(sentence);
    if (cats) subjects.push({ subject: subjectName(sentence), posts: verticalSum(cats), categories: cats });
  }
  return { subjects };
}

export async function addSeats(jobs) {
  let cache = {};
  try {
    cache = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
  } catch {}
  const dir = await mkdtemp(join(tmpdir(), 'seats-'));
  let checked = 0;
  try {
    for (const job of jobs) {
      const c = cache[job.id];
      if (c && Date.now() - new Date(c.checkedAt).getTime() < RECHECK_DAYS * 86400000) continue;
      try {
        cache[job.id] = { checkedAt: new Date().toISOString(), ...(await seatsFor(job, dir)) };
        checked++;
      } catch (err) {
        console.warn(`Seats for ${job.id} failed: ${err.message}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const ids = new Set(jobs.map((j) => j.id));
  for (const id of Object.keys(cache)) if (!ids.has(id)) delete cache[id];
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');
  console.log(`Seats: checked ${checked} ads.`);
  // Official notification PDFs, which the app can show inside it.
  return jobs.map((j) => ({
    ...j,
    seats: cache[j.id]?.seats ?? null,
    notices: cache[j.id]?.notices ?? [],
    lastDate: j.lastDate ?? cache[j.id]?.lastDate ?? null,
  }));
}

export const _test = { fromTables, fromLayoutText, htmlRows, tokenCats, pdfText, lastDates };
