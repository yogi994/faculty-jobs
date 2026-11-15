// Scores how well a job fits her CV (0-100) and explains why.
// Profile (kept generic, no personal details): PhD in Commerce (2025),
// UGC-NET JRF; teaches corporate finance, company law, accountancy and
// financial management; researches corporate governance and women's
// leadership; ~1.5 years post-PhD; wants Delhi NCR, ideally Gurugram.

const has = (re, t) => re.test(t);

const CORE = /commerce|accounting|accountancy|(?<!self[- ])\bfinance\b|financial|corporate governance|company law|corporate law|\bm\.?\s?com\b|\bb\.?\s?com\b|taxation|auditing/i;
const MGMT = /management|business|\bmba\b|\bbba\b|\bpgdm\b|business administration/i;
const ADJACENT = /economics|human resource|\bhr\b|organi[sz]ational behaviou?r|strategy|strategic|marketing|operations|business analytics|entrepreneurship|banking|insurance/i;
const RESEARCH = /corporate governance|\besg\b|women|gender|\bcsr\b|business ethics/i;
const METHODS = /spss|smartpls|pls-sem|structural equation|nvivo|quantitative research|research methodolog/i;
const OTHER_SUBJECT = /computer|\bcse\b|\bbca\b|\bmca\b|engineering|mathematics|actuarial|fashion|design|\blaw\b|pharma|nursing|physics|chemistry|biology|english|hindi|psychology|hotel|journalism|data science|artificial intelligence|communication|media|film|cyber|block ?chain|soil|agricultur/i;

const BOTH_LEVELS = /assistant\s*\/\s*associate|assistant\s*(or|&|and)\s*associate|associate\s*\/\s*assistant/i;
const SENIOR_ONLY = /^(?!.*assistant).*\b(associate professor|professor|dean|director|head)\b/i;
const GRADE_I = /grade[- ]?i\b(?!i)|3\+?\s*years?[^.]{0,40}post[- ]?(ph\.?\s?d|doctoral)|post[- ]?(ph\.?\s?d|doctoral)[^.]{0,40}(three|3)\s*years?/i;
const MANY_YEARS = /(\d{1,2})\+?\s*(?:(?:-|to)\s*\d{1,2}\s*)?years?\s*(?:of\s*)?(?:post[- ]?ph\.?\s?d\.?\s*|relevant\s*|professional\s*|academic\s*|teaching\s*|industry\s*|work\s*|or\s*|and\s*|\/\s*)*experience/i;

const GURUGRAM = /gurugram|gurgaon|manesar/i;
const CORE_NCR = /delhi|noida|gautam buddha nagar|faridabad|ghaziabad|dwarka|sonipat/i;
const PERMANENT_GOVT = /hpsc|uppsc|upessc|rpsc|dsssb|university of delhi|delhi university|\(du\)|mahavidyalaya|central university|\bcuh\b|government (college|university)|\bnit\b|national institute|\biit\b|\biiit\b|\biim\b|niftem|gurugram university|gautam buddha university|\bdtu\b|delhi technological|\bnsut\b|ggsipu|ip university|ambedkar university|maharshi dayanand|\bmdu\b|kurukshetra university|state university/i;
const NOT_PERMANENT = /guest|visiting|adjunct|contract|ad[- ]?hoc|temporary|part[- ]time|skill assistant|online program/i;

const count = (re, t) => (t.match(new RegExp(re.source, 'gi')) ?? []).length;
const word = (re, t) => t.match(re)?.[0].toLowerCase();

function subject(title, text) {
  // When the title names a subject, the title decides.
  if (has(CORE, title)) return [40, true, 'Commerce / finance / accounting: your teaching area'];
  if (has(ADJACENT, title)) return [26, true, `Management area (${word(ADJACENT, title)}): partly your field`];
  if (has(MGMT, title)) return [32, true, 'Management / business: close to your field'];
  if (has(OTHER_SUBJECT, title)) return [0, false, `Subject (${word(OTHER_SUBJECT, title)}) is outside commerce/management`];
  // Otherwise judge from the ad text: whichever field it talks about most.
  const t = text.slice(0, 2500);
  const core = count(CORE, t);
  const mgmt = count(MGMT, t);
  const other = count(OTHER_SUBJECT, t);
  if (other > core + mgmt) return [0, false, `Ad is for another subject (${word(OTHER_SUBJECT, t)})`];
  if (core) return [36, true, 'Ad asks for commerce / finance / accounting'];
  if (mgmt) return [28, true, 'Ad asks for management / business'];
  if (has(ADJACENT, t)) return [18, null, `Adjacent subject (${word(ADJACENT, t)})`];
  return [16, null, 'Subject not stated: check the ad'];
}

function level(title, text) {
  if (has(SENIOR_ONLY, title)) return [0, false, 'Senior post: needs more experience than you have'];
  if (has(GRADE_I, text)) return [6, false, 'Asks for 3+ years post-PhD; you have about 1.5 (Grade II only)'];
  const yrs = Number(text.match(MANY_YEARS)?.[1] ?? 0);
  if (yrs >= 5) return [8, false, `Asks for ${yrs}+ years' experience; you have under 3`];
  if (has(BOTH_LEVELS, title)) return [16, true, 'Assistant or Associate: you fit the Assistant level'];
  return [20, true, 'Assistant Professor: matches your level (PhD + NET-JRF)'];
}

function place(job) {
  const t = `${job.title} ${job.org} ${job.location ?? ''}`;
  if (has(GURUGRAM, t)) return [25, true, 'Gurugram: your first choice'];
  if (has(CORE_NCR, t) || job.region === 'Delhi') return [21, true, 'Delhi NCR'];
  if (job.region === 'Haryana' || job.region === 'UP-NCR') return [13, null, `${job.region}, outside core NCR`];
  return [4, false, 'Rajasthan: you want to move to NCR'];
}

function institution(job, text) {
  const t = `${job.title} ${job.org} ${text}`;
  if (has(PERMANENT_GOVT, t)) return [15, true, 'Government institution: UGC pay scale'];
  if (job.preferred) return [13, true, 'Well-regarded institution'];
  return [6, null, 'Private institution: check the pay beats your current salary'];
}

export function scoreJob(job) {
  const text = `${job.qualification ?? ''} ${job.summary ?? ''} ${job.details ?? ''}`;
  const parts = [subject(job.title, text), level(job.title, text), place(job), institution(job, text)];
  let score = parts.reduce((n, [p]) => n + p, 0);
  const reasons = parts.map(([, ok, text]) => ({ ok, text }));
  const temp = job.title.match(NOT_PERMANENT)?.[0];
  if (temp) {
    score -= 15;
    reasons.push({ ok: false, text: `${temp[0].toUpperCase()}${temp.slice(1).toLowerCase()} post: a step down from your permanent job` });
  }
  // Small bonuses from the full ad text, when there is one.
  const subjectFits = parts[0][0] > 0;
  if (subjectFits && job.details && has(RESEARCH, job.details)) {
    score += 5;
    reasons.push({ ok: true, text: 'Ad mentions governance / leadership / ESG: your research area' });
  }
  if (subjectFits && job.details && has(METHODS, job.details)) {
    score += 3;
    reasons.push({ ok: true, text: 'Wants research-methods skills you have (SPSS / PLS-SEM / NVivo)' });
  }
  if (!job.details && !job.qualification && (job.summary ?? '').length < 80) reasons.push({ ok: null, text: 'Scored from the title only' });
  return { matchScore: Math.max(0, Math.min(100, score)), matchReasons: reasons };
}
