import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { Job, JOBS_URL, JobsFile } from './config';
import { loadStatuses } from './storage';

// Checks the jobs list in the background and posts a phone notification
// for openings she hasn't seen yet. Android decides the exact timing;
// we ask for roughly hourly checks.
const TASK = 'check-new-jobs';
const SEEN_KEY = 'seen-job-ids';
const CHANNEL = 'new-jobs';
const CHECK_EVERY_MINUTES = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function readSeen(): Promise<Set<string> | null> {
  try {
    const v = await AsyncStorage.getItem(SEEN_KEY);
    return v ? new Set(JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
}

// Called whenever the list is shown in the app, so she isn't notified about jobs she has already seen.
export async function markSeen(jobs: Job[]) {
  const seen = (await readSeen()) ?? new Set<string>();
  jobs.forEach((j) => seen.add(j.id));
  // Keep only ids still in the list so storage doesn't grow forever.
  const current = new Set(jobs.map((j) => j.id));
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen].filter((id) => current.has(id))));
}

function describe(fresh: Job[]) {
  const name = (j: Job) =>
    `${j.matchScore !== undefined ? `${j.matchScore}% · ` : ''}${j.org && j.org !== j.title ? `${j.org}: ${j.title}` : j.title}`;
  if (fresh.length === 1) {
    const j = fresh[0];
    return {
      title: 'New Assistant Professor opening',
      body: `${name(j)}${j.lastDate ? ` · last date ${j.lastDate}` : ''}`,
    };
  }
  const shown = fresh.slice(0, 3).map((j) => `• ${name(j)}`);
  if (fresh.length > 3) shown.push(`+${fresh.length - 3} more`);
  return { title: `${fresh.length} new Assistant Professor openings`, body: shown.join('\n') };
}

export async function checkForNewJobs(): Promise<number> {
  const res = await fetch(`${JOBS_URL}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as JobsFile;
  const seen = await readSeen();
  if (!seen) {
    // First check after install: remember what's there without notifying about all of it.
    await markSeen(data.jobs);
    return 0;
  }
  const statuses = await loadStatuses();
  // Best matches first in the message.
  const fresh = data.jobs
    .filter((j) => !seen.has(j.id) && statuses[j.id] !== 'hidden')
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  if (fresh.length) {
    await Notifications.scheduleNotificationAsync({
      content: { ...describe(fresh), ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) },
      trigger: null,
    });
  }
  data.jobs.forEach((j) => seen.add(j.id));
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  return fresh.length;
}

// Must be defined at startup (imported from index.ts) so Android can run it while the app is closed.
TaskManager.defineTask(TASK, async () => {
  try {
    await checkForNewJobs();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Ask for notification permission and start the background checks. Safe to call on every launch.
export async function setUpNotifications(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'New job openings',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if ((await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available &&
        !(await TaskManager.isTaskRegisteredAsync(TASK))) {
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: CHECK_EVERY_MINUTES });
    }
    return granted;
  } catch {
    return false;
  }
}
