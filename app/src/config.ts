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
};

export type JobsFile = { updatedAt: string; jobs: Job[] };
