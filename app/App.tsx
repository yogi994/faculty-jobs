import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Job, REGIONS, Region } from './src/config';
import { markSeen, setUpNotifications } from './src/notify';
import { JobStatus, loadJobs, loadStatuses, markOpened, saveStatuses } from './src/storage';

type Tab = 'all' | 'saved' | 'applied';

const C = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#1B1F24',
  muted: '#667085',
  line: '#E4E7EC',
  accent: '#1F4E79',
  accentSoft: '#E3ECF5',
  green: '#1E7B4F',
  greenSoft: '#E2F3EA',
  red: '#B42318',
  amberSoft: '#FFF4D6',
};

const today = () => new Date().toISOString().slice(0, 10);
const daysLeft = (d: string) => Math.round((new Date(d).getTime() - new Date(today()).getTime()) / 86400000);
const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function JobCard({
  job, status, isNew, onStatus,
}: { job: Job; status?: JobStatus; isNew: boolean; onStatus: (st: JobStatus | null) => void }) {
  const left = job.lastDate ? daysLeft(job.lastDate) : null;
  const [why, setWhy] = useState(false);
  const score = job.matchScore;
  const tone = score === undefined ? null : score >= 75 ? 'good' : score >= 55 ? 'ok' : 'low';
  return (
    <Pressable style={s.card} onPress={() => Linking.openURL(job.url)} accessibilityHint="Opens the job notice">
      {score !== undefined && (
        <View style={s.scoreRow}>
          <Text style={[s.score, tone === 'good' ? s.scoreGood : tone === 'ok' ? s.scoreOk : s.scoreLow]}>{score}% match</Text>
          <Pressable onPress={() => setWhy((v) => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={s.why}>{why ? 'Hide reasons' : 'Why this score?'}</Text>
          </Pressable>
        </View>
      )}
      {why && (
        <View style={s.reasons}>
          {job.matchReasons?.map((r, i) => (
            <Text key={i} style={s.reason}>
              <Text style={{ color: r.ok === true ? C.green : r.ok === false ? C.red : C.muted, fontWeight: '700' }}>
                {r.ok === true ? '✓ ' : r.ok === false ? '✗ ' : '• '}
              </Text>
              {r.text}
            </Text>
          ))}
        </View>
      )}
      <View style={s.tagRow}>
        {isNew && <Text style={[s.tag, s.tagNew]}>NEW</Text>}
        {job.subjectMatch && <Text style={[s.tag, s.tagGreen]}>Commerce / Mgmt</Text>}
        {job.preferred && <Text style={[s.tag, s.tagBlue]}>Top institution</Text>}
        <Text style={[s.tag, s.tagGrey]}>{job.region}</Text>
      </View>
      <Text style={s.title}>{job.title}</Text>
      {!!job.org && job.org !== job.title.split(':')[0] && <Text style={s.org}>{job.org}</Text>}
      {!!job.location && <Text style={s.meta}>{job.location}</Text>}
      {!!job.qualification && <Text style={s.meta}>Qualification: {job.qualification}</Text>}
      <View style={s.footer}>
        <Text style={[s.meta, left !== null && left <= 5 && { color: C.red, fontWeight: '600' }]}>
          {job.lastDate
            ? `Last date ${fmt(job.lastDate)}${left !== null && left >= 0 ? ` · ${left === 0 ? 'today' : `${left}d left`}` : ' · closed'}`
            : `Found ${fmt(job.firstSeen)}`}
        </Text>
        <Text style={s.source}>{job.source}</Text>
      </View>
      <View style={s.actions}>
        <Pressable onPress={() => onStatus(status === 'saved' ? null : 'saved')} style={s.action} hitSlop={6}>
          <Text style={[s.actionText, status === 'saved' && s.actionOn]}>{status === 'saved' ? '★ Saved' : '☆ Save'}</Text>
        </Pressable>
        <Pressable onPress={() => onStatus(status === 'applied' ? null : 'applied')} style={s.action} hitSlop={6}>
          <Text style={[s.actionText, status === 'applied' && s.actionOn]}>{status === 'applied' ? '✓ Applied' : 'Mark applied'}</Text>
        </Pressable>
        <Pressable onPress={() => onStatus('hidden')} style={s.action} hitSlop={6}>
          <Text style={s.actionText}>Hide</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Main() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, JobStatus>>({});
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [regions, setRegions] = useState<Region[]>([]);
  const [commerceOnly, setCommerceOnly] = useState(false);
  const [topOnly, setTopOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [notifOff, setNotifOff] = useState(false);
  const [sort, setSort] = useState<'match' | 'newest'>('match');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, offline } = await loadJobs();
    setOffline(offline);
    if (data) {
      setJobs(data.jobs);
      setUpdatedAt(data.updatedAt);
      if (!offline) markSeen(data.jobs).catch(() => {});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setStatuses(await loadStatuses());
      setLastOpened(await markOpened());
      await refresh();
      setNotifOff(!(await setUpNotifications()));
    })();
  }, [refresh]);

  const setStatus = useCallback((id: string, st: JobStatus | null) => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (st) next[id] = st;
      else delete next[id];
      saveStatuses(next);
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = jobs.filter((j) => {
      const st = statuses[j.id];
      if (tab === 'all' && st === 'hidden') return false;
      if (tab === 'saved' && st !== 'saved') return false;
      if (tab === 'applied' && st !== 'applied') return false;
      if (regions.length && !regions.includes(j.region)) return false;
      if (commerceOnly && !j.subjectMatch) return false;
      if (topOnly && !j.preferred) return false;
      if (q && !`${j.title} ${j.org} ${j.qualification ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return sort === 'match' ? [...list].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)) : list;
  }, [jobs, statuses, tab, regions, commerceOnly, topOnly, query, sort]);

  const newCount = lastOpened ? jobs.filter((j) => j.firstSeen > lastOpened && statuses[j.id] !== 'hidden').length : 0;
  const toggleRegion = (r: Region) => setRegions((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.h1}>Faculty Jobs</Text>
        <Text style={s.sub}>
          Assistant Professor · Commerce & Management
          {updatedAt ? `\nUpdated ${new Date(updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
          {offline ? ' · offline copy' : ''}
        </Text>
        {newCount > 0 && <Text style={s.banner}>{newCount} new since your last visit</Text>}
        {notifOff && Platform.OS === 'android' && (
          <Pressable onPress={() => Linking.openSettings()}>
            <Text style={s.notifOff}>Notifications are off, so new openings won't alert you. Tap to turn them on.</Text>
          </Pressable>
        )}
      </View>

      <View style={s.tabs}>
        {(['all', 'saved', 'applied'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'all' ? 'Openings' : t === 'saved' ? 'Saved' : 'Applied'}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={s.search}
        placeholder="Search college, university, subject…"
        placeholderTextColor={C.muted}
        value={query}
        onChangeText={setQuery}
        clearButtonMode="while-editing"
      />
      <View style={s.chips}>
        {REGIONS.map((r) => (
          <Chip key={r} label={r} active={regions.includes(r)} onPress={() => toggleRegion(r)} />
        ))}
        <Chip label="Commerce / Mgmt" active={commerceOnly} onPress={() => setCommerceOnly((v) => !v)} />
        <Chip label="Top institutions" active={topOnly} onPress={() => setTopOnly((v) => !v)} />
        <Chip
          label={sort === 'match' ? 'Sorted: best match' : 'Sorted: newest'}
          active={false}
          onPress={() => setSort((v) => (v === 'match' ? 'newest' : 'match'))}
        />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(j) => j.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            status={statuses[item.id]}
            isNew={!!lastOpened && item.firstSeen > lastOpened}
            onStatus={(st) => setStatus(item.id, st)}
          />
        )}
        ListEmptyComponent={
          loading ? undefined : (
            <Text style={s.empty}>
              {jobs.length === 0
                ? 'Could not load jobs. Pull down to try again.'
                : tab === 'all'
                  ? 'No openings match these filters.'
                  : `Nothing ${tab} yet.`}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  h1: { fontSize: 26, fontWeight: '700', color: C.text },
  sub: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  banner: { marginTop: 8, backgroundColor: C.amberSoft, color: C.text, padding: 8, borderRadius: 8, fontWeight: '600', overflow: 'hidden' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  score: { fontSize: 13, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  scoreGood: { backgroundColor: C.greenSoft, color: C.green },
  scoreOk: { backgroundColor: C.amberSoft, color: '#8A5A00' },
  scoreLow: { backgroundColor: C.line, color: C.muted },
  why: { fontSize: 13, color: C.accent, fontWeight: '600' },
  reasons: { backgroundColor: C.bg, borderRadius: 8, padding: 8, marginBottom: 8, gap: 4 },
  reason: { fontSize: 13, color: C.text, lineHeight: 18 },
  notifOff: { marginTop: 8, backgroundColor: C.accentSoft, color: C.accent, padding: 8, borderRadius: 8, overflow: 'hidden' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, backgroundColor: C.line, borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: C.card },
  tabText: { color: C.muted, fontWeight: '600' },
  tabTextActive: { color: C.text },
  search: { marginHorizontal: 16, marginTop: 10, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 13, color: C.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, paddingTop: 8, gap: 10 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.line },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  tag: { fontSize: 11, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  tagNew: { backgroundColor: C.amberSoft, color: '#8A5A00' },
  tagGreen: { backgroundColor: C.greenSoft, color: C.green },
  tagBlue: { backgroundColor: C.accentSoft, color: C.accent },
  tagGrey: { backgroundColor: C.bg, color: C.muted },
  title: { fontSize: 16, fontWeight: '600', color: C.text, lineHeight: 21 },
  org: { fontSize: 13, color: C.muted, marginTop: 2 },
  meta: { fontSize: 13, color: C.muted, marginTop: 6 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  source: { fontSize: 11, color: C.muted },
  actions: { flexDirection: 'row', gap: 18, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  action: { paddingVertical: 2 },
  actionText: { color: C.accent, fontWeight: '600', fontSize: 13 },
  actionOn: { color: C.green },
  empty: { textAlign: 'center', color: C.muted, marginTop: 40 },
});
