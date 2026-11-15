import AsyncStorage from '@react-native-async-storage/async-storage';
import { JOBS_URL, JobsFile } from './config';

export type JobStatus = 'saved' | 'applied' | 'hidden';

const KEYS = {
  cache: 'jobs-cache',
  status: 'job-status',
  lastOpened: 'last-opened',
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Fetch the latest list; fall back to the last copy when offline.
export async function loadJobs(): Promise<{ data: JobsFile | null; offline: boolean }> {
  try {
    const res = await fetch(`${JOBS_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as JobsFile;
    await AsyncStorage.setItem(KEYS.cache, JSON.stringify(data));
    return { data, offline: false };
  } catch {
    return { data: await readJson<JobsFile | null>(KEYS.cache, null), offline: true };
  }
}

export const loadStatuses = () => readJson<Record<string, JobStatus>>(KEYS.status, {});
export const saveStatuses = (s: Record<string, JobStatus>) => AsyncStorage.setItem(KEYS.status, JSON.stringify(s));

// Returns the previous "last opened" date and records today's.
export async function markOpened(): Promise<string | null> {
  const prev = await AsyncStorage.getItem(KEYS.lastOpened);
  await AsyncStorage.setItem(KEYS.lastOpened, new Date().toISOString().slice(0, 10));
  return prev;
}
