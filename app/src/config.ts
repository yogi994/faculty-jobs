// Where the collector publishes the jobs list (updated every few hours).
export const JOBS_URL =
  process.env.EXPO_PUBLIC_JOBS_URL ?? 'https://raw.githubusercontent.com/yogi994/faculty-jobs/main/data/jobs.json';

export const REGIONS = ['Delhi', 'Haryana', 'Rajasthan', 'UP-NCR'] as const;
export type Region = (typeof REGIONS)[number];

export type Job = {
  id: string;
  title: string;
  org: string;
  url: string;
  region: Region;
  source: string;
  postedAt: string | null;
  lastDate: string | null;
  firstSeen: string;
  qualification?: string;
  advtNo?: string;
  subjectMatch: boolean;
  preferred: boolean;
  official?: boolean;
  location?: string;
  // Direct ways to apply, when the ad gives them (LinkedIn posts).
  applyUrl?: string | null;
  applyEmail?: string | null;
  // Fit with her CV, 0-100, with the reasons behind it.
  matchScore?: number;
  matchReasons?: { ok: boolean | null; text: string }[];
  // Number of posts, when the ad states it.
  openings?: number | null;
  institution?: Institution | null;
  // Seats for her subjects, and for the whole ad, by reservation category.
  seats?: Seats | null;
  // Official notification PDFs.
  notices?: { url: string; inApp: boolean }[];
};

export type Seats = {
  subjects: { subject: string; posts: number; categories: Record<string, number> | null }[];
  totals: Record<string, number> | null;
  ocr: boolean;
};

export type Reviews = {
  source: string;
  url: string;
  scope: string; // 'Assistant Professors' or 'all staff'
  count: number | null;
  overall: number;
  culture: number | null;
  workLife: number | null;
  jobSecurity: number | null;
  salary: number | null;
  careerGrowth: number | null;
  skillDevelopment: number | null;
  praised: string[];
  criticised: string[];
  likes: string[];
  dislikes: string[];
};

export type Institution = {
  name: string;
  website: string;
  type: 'Government' | 'Private';
  note: string | null;
  reviews: Reviews | null;
};

export type JobsFile = { updatedAt: string; jobs: Job[] };
