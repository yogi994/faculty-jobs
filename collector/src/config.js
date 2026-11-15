// What counts as a relevant job: Assistant Professor posts in
// Commerce / Management, in Delhi NCR, Haryana, Rajasthan and west-UP NCR,
// at well-established institutions (NAAC A/A+ or better).

export const REGIONS = ['Delhi', 'Haryana', 'Rajasthan', 'UP-NCR'];

// Words that place a job in a region (matched on title + org + text).
export const REGION_KEYWORDS = {
  Delhi: ['delhi', 'new delhi', 'dwarka', 'du ', 'university of delhi', 'ggsipu', 'ip university', 'dtu', 'nsut', 'iit delhi', 'iift', 'aud ', 'ambedkar university'],
  Haryana: ['haryana', 'gurugram', 'gurgaon', 'faridabad', 'rohtak', 'sonipat', 'hisar', 'kurukshetra', 'panipat', 'karnal', 'rewari', 'meerpur', 'mahendergarh', 'bhiwani', 'murthal', 'hpsc', 'mdi ', 'ashoka', 'jindal'],
  Rajasthan: ['rajasthan', 'jaipur', 'udaipur', 'jodhpur', 'ajmer', 'kota', 'bikaner', 'tonk', 'alwar', 'rpsc', 'banasthali', 'mnit', 'lnmiit', 'iihmr', 'kishangarh'],
  'UP-NCR': ['noida', 'greater noida', 'ghaziabad', 'meerut', 'gautam buddh', 'bulandshahr', 'baghpat', 'upessc', 'uppsc', 'imt ', 'jaipuria', 'shiv nadar'],
};

// The post must be an entry-level faculty post (she is not yet eligible for
// Associate Professor or Professor, so ads for only those are dropped).
export const ROLE_PATTERN = /assistant\s*prof|asst\.?\s*prof|faculty|teaching\s*(post|position|staff|recruit|vacanc)/i;

// News headlines must read like an opening, not just mention the word.
export const OPENING_PATTERN = /recruit|vacanc|walk.?in|apply|notification|hiring|opening|posts|positions|invites|advert|advt/i;

// Subject match: Commerce, Management, Finance, Accounting, Business.
export const SUBJECT_PATTERN = /commerce|management|finance|accounting|accountancy|business|m\.?com\b|mba\b|bba\b|economics|banking/i;

// Posts that are never a fit (medical, school, engineering-only, law, etc.).
export const EXCLUDE_PATTERN = new RegExp(
  [
    // medical and health
    'aiims', 'esic', 'medical', 'nursing', 'dental', 'ayush', 'ayurved', 'homoeopath', 'pharmac', 'veterinar', 'hospital', 'senior resident', 'junior resident',
    '\\bucms\\b', '\\bilbs\\b', 'radiology', 'liver', 'paramedical', 'physiotherap',
    // school-level and non-faculty
    '\\bpgt\\b', '\\btgt\\b', '\\bprt\\b', 'school teacher', 'assistant teacher', 'kendriya vidyalaya', 'navodaya',
    'watchman', 'rseti', 'sub-?inspector', 'non[- ]teaching', 'law school', 'school of law', 'polytechnic', '\\biti\\b', 'agricultur',
    // exam-stage news, not openings
    'answer key', 'admit card', 'hall ticket', 'city (intimation )?slip', 'intimation', 'result', 'exam date', 'exam schedule', 'syllabus',
    'cut ?off', 'merit list', 'interview (date|schedule)', 'application form 20\\d\\d', 'admission',
    // recruitment-process notices for ads already running
    'lists? of', 'selected', 'recommendation', 'written test', 'cut[- ]?off', 'objection', 'provisional', 'waiting list', 'date-?sheet', 'grievance', 'cancell', 'eligibility of', 'eligible candidates', 'ans(wer)?\\.? key', 'q\\. and ans',
    '\\bmarks\\b', 'roll no', 'inspection', 'qualified', 'shortlist', 'proposal', 'publication', 'presentation', 'schedule', 'appointment of', 'engagement of', 'joining',
    // unrelated news
    'harass', 'on leave', 'suspend', 'arrest', 'protest', 'strike', 'iris murdoch',
  ].join('|'),
  'i',
);

// Posts that name another subject (and not Commerce/Management) are dropped.
export const OTHER_SUBJECT_PATTERN = /engineering|civil|mechanical|electrical|electronics|computer|\bcse\b|\bece\b|architecture|planning|mathematics|maths|physics|chemistry|biochem|biotech|biology|botany|zoology|microbio|science|hindi|english|sanskrit|urdu|punjabi|history|geography|political|sociology|psychology|philosophy|music|vocal|fine arts|painting|yoga|physical education|horticulture|agricultur|food tech|\blaw\b|legal|pharma|b\.?ed\b|b\.?el\.?ed|journalism|mass comm|home science|textile|fashion|design|hotel|tourism|library|statistics/i;

// Places outside the target regions; feeds sometimes file these under a nearby state.
export const OTHER_PLACES_PATTERN = /lucknow|kanpur|prayagraj|allahabad|varanasi|gorakhpur|agra|aligarh|bareilly|jhansi|punjab|chandigarh|mohali|ludhiana|amritsar|himachal|shimla|uttarakhand|dehradun|bihar|patna|jharkhand|bhopal|indore|madhya pradesh|mumbai|pune|maharashtra|gujarat|kolkata|bengal|odisha|bangalore|bengaluru|karnataka|chennai|tamil|hyderabad|telangana|andhra|kerala|assam|jammu|kashmir/i;

// Qualification columns that mark a medical post.
export const EXCLUDE_QUALIFICATION = /\bmbbs\b|\bmd\b|\bdm\b|\bbds\b|\bmds\b|\bm\.?ch\b|\bms\/md\b|dnb|b\.?pharm|m\.?pharm|b\.?sc nursing/i;

// Institutions not wanted: minority-run, low-tier, or explicitly excluded.
export const BLOCKED_ORGS = /jamia|jnu|jawaharlal nehru university|aligarh|\bamu\b|jims|gd goenka|g\.d\. goenka|bennett|sharda|galgotia|lingaya|apeejay|st\.? stephen|st\.? xavier|christ university|lady shri ram|jesus and mary/i;

// Preferred institutions (NAAC A/A+, central, or top private). Jobs matching these
// are flagged so the app can show them first.
export const PREFERRED_ORGS = /university of delhi|delhi university|\bdu\b|college.*\(du\)|srcc|shri ram college|sggscc|hansraj|kirori mal|ramjas|hindu college|miranda|venkateswara|deshbandhu|ambedkar university|\baud\b|ggsipu|ip university|iit|iim|mdi|management development institute|imt|imi|fore school|iift|lbsim|great lakes|ashoka|jindal|shiv nadar|amity|central university|mnit|lnmiit|manipal|iihmr|university of rajasthan|uniraj|curaj|cuh|maharshi dayanand|mdu|kurukshetra|guru jambheshwar|gjust|gurugram university|indira gandhi university|hpsc|rpsc|upessc|uppsc|south asian university|gautam buddha|nsut|dtu|delhi technological|mohanlal sukhadia/i;

// Drop jobs whose last date passed more than this many days ago,
// and undated jobs first seen more than this many days ago.
export const KEEP_DAYS_AFTER_DEADLINE = 3;
export const KEEP_UNDATED_DAYS = 45;
