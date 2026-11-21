import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Institution, Job, REGIONS, Region, Seats } from './src/config';
import { markSeen, setUpNotifications } from './src/notify';
import { PdfViewer } from './src/PdfViewer';
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

const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const rateColor = (n: number | null) => (n === null ? C.muted : n >= 4 ? C.green : n >= 3 ? '#8A5A00' : C.red);

const CAT_ORDER = ['UR', 'EWS', 'OBC', 'BC-A', 'BC-B', 'MBC', 'SC', 'DSC', 'OSC', 'ST', 'PwBD', 'ESM'];
const catLine = (cats: Record<string, number>) =>
  Object.entries(cats)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b))
    .map(([c, n]) => `${c} ${n}`)
    .join(' · ');

function SeatsBox({ seats }: { seats: Seats }) {
  const totalAll = seats.totals ? Object.entries(seats.totals).filter(([c]) => c !== 'PwBD' && c !== 'ESM').reduce((n, [, v]) => n + v, 0) : 0;
  return (
    <View style={s.seats}>
      {seats.subjects.map((x) => (
        <Text key={x.subject} style={s.seatLine}>
          <Text style={s.seatSubject}>{x.subject}: {x.posts} {x.posts === 1 ? 'seat' : 'seats'}</Text>
          {x.categories && catLine(x.categories) ? <Text style={s.seatCats}>{`  (${catLine(x.categories)})`}</Text> : null}
        </Text>
      ))}
      {seats.totals && catLine(seats.totals) !== '' && (
        <Text style={s.seatLine}>
          <Text style={s.seatMuted}>{seats.subjects.length ? 'All subjects' : 'All posts'}{totalAll ? ` (${totalAll})` : ''} by category: </Text>
          <Text style={s.seatCats}>{catLine(seats.totals)}</Text>
        </Text>
      )}
      {seats.ocr && <Text style={s.seatMuted}>Read from a scanned notice: check the numbers in the notice.</Text>}
    </View>
  );
}

function InstitutionPanel({ inst }: { inst: Institution }) {
  const r = inst.reviews;
  const rows: [string, number | null][] = r
    ? [['Work culture', r.culture], ['Work-life balance', r.workLife], ['Job security', r.jobSecurity], ['Salary & benefits', r.salary], ['Career growth', r.careerGrowth], ['Skill development', r.skillDevelopment]]
    : [];
  return (
    <View style={s.instPanel}>
      <Text style={s.instName}>{inst.name} · {inst.type}</Text>
      {inst.note && <Text style={s.instText}>{inst.note}</Text>}
      {r ? (
        <>
          <Text style={s.instText}>
            Rated <Text style={{ fontWeight: '700', color: rateColor(r.overall) }}>{r.overall}/5</Text> by {r.count ?? 'some'}{' '}
            {r.scope === 'Assistant Professors' ? 'Assistant Professors who work there' : 'staff (not enough faculty reviews)'} on {r.source}.
          </Text>
          {(r.count ?? 0) < 5 && <Text style={[s.instText, { color: C.red }]}>Only a few reviews: treat with caution.</Text>}
          {rows.filter(([, v]) => v !== null).map(([label, v]) => (
            <View key={label} style={s.rateRow}>
              <Text style={s.rateLabel}>{label}</Text>
              <View style={s.rateBar}><View style={[s.rateFill, { width: `${((v ?? 0) / 5) * 100}%`, backgroundColor: rateColor(v) }]} /></View>
              <Text style={[s.rateNum, { color: rateColor(v) }]}>{v?.toFixed(1)}</Text>
            </View>
          ))}
          {r.praised.length > 0 && <Text style={s.instText}><Text style={{ color: C.green, fontWeight: '700' }}>Praised: </Text>{r.praised.join(', ')}</Text>}
          {r.criticised.length > 0 && <Text style={s.instText}><Text style={{ color: C.red, fontWeight: '700' }}>Criticised: </Text>{r.criticised.join(', ')}</Text>}
          {r.likes.length > 0 && <Text style={s.quoteHead}>What staff like</Text>}
          {r.likes.map((q, i) => <Text key={`l${i}`} style={s.quote}>“{q}”</Text>)}
          {r.dislikes.length > 0 && <Text style={s.quoteHead}>What staff dislike</Text>}
          {r.dislikes.map((q, i) => <Text key={`d${i}`} style={s.quote}>“{q}”</Text>)}
          <Pressable onPress={() => Linking.openURL(r.url)} hitSlop={6}>
            <Text style={s.why}>All reviews on {r.source} ↗</Text>
          </Pressable>
        </>
      ) : (
        <Text style={s.instText}>No employee reviews found online for this institution.</Text>
      )}
    </View>
  );
}

function JobCard({
  job, status, isNew, onStatus, onPdf,
}: { job: Job; status?: JobStatus; isNew: boolean; onStatus: (st: JobStatus | null) => void; onPdf: (url: string) => void }) {
  const pdfs = (job.notices?.length ? job.notices : /\.pdf(\?|$)/i.test(job.url) ? [{ url: job.url, inApp: true }] : []).slice(0, 2);
  const left = job.lastDate ? daysLeft(job.lastDate) : null;
  const [why, setWhy] = useState(false);
  const [about, setAbout] = useState(false);
  const inst = job.institution;
  const rev = inst?.reviews;
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
        {!!job.openings && <Text style={[s.tag, s.tagPosts]}>{job.openings} {job.openings === 1 ? 'post' : 'posts'}</Text>}
        {job.subjectMatch && <Text style={[s.tag, s.tagGreen]}>Commerce / Mgmt</Text>}
        {job.preferred && <Text style={[s.tag, s.tagBlue]}>Top institution</Text>}
        <Text style={[s.tag, s.tagGrey]}>{job.region}</Text>
      </View>
      <Text style={s.title}>{job.title}</Text>
      {!!job.org && job.org !== job.title.split(':')[0] && <Text style={s.org}>{job.org}</Text>}
      {!!job.location && <Text style={s.meta}>{job.location}</Text>}
      {!!job.qualification && <Text style={s.meta}>Qualification: {job.qualification}</Text>}
      {!!job.seats && (job.seats.subjects.length > 0 || !!job.seats.totals) && <SeatsBox seats={job.seats} />}
      {inst && (
        <Pressable onPress={() => setAbout((v) => !v)} style={s.rating} hitSlop={6} accessibilityRole="button">
          {rev ? (
            <Text style={s.ratingText}>
              <Text style={{ color: rateColor(rev.overall) }}>{stars(rev.overall)} {rev.overall}/5</Text>
              <Text style={s.ratingMuted}> · {rev.count} {rev.scope === 'Assistant Professors' ? 'faculty' : 'staff'} reviews</Text>
            </Text>
          ) : (
            <Text style={s.ratingMuted}>{inst.type} · no reviews online</Text>
          )}
          <Text style={s.why}>{about ? 'Hide' : 'Work culture ›'}</Text>
        </Pressable>
      )}
      {about && inst && <InstitutionPanel inst={inst} />}
      <View style={s.footer}>
        <Text style={[s.meta, left !== null && left <= 5 && { color: C.red, fontWeight: '600' }]}>
          {job.lastDate
            ? `Last date ${fmt(job.lastDate)}${left !== null && left >= 0 ? ` · ${left === 0 ? 'today' : `${left}d left`}` : ' · closed'}`
            : `Found ${fmt(job.firstSeen)}`}
        </Text>
        <Text style={s.source}>{job.source}</Text>
      </View>
      <View style={s.applyRow}>
        <Pressable
          onPress={() => Linking.openURL(job.applyUrl || job.url)}
          style={[s.applyBtn, s.applyPrimary]}
          accessibilityRole="link"
        >
          <Text style={s.applyPrimaryText}>
            {job.applyUrl ? 'Apply ↗' : job.source === 'LinkedIn' ? 'Easy Apply on LinkedIn ↗' : 'Notice & apply ↗'}
          </Text>
        </Pressable>
        {!!job.applyUrl && job.source === 'LinkedIn' && (
          <Pressable onPress={() => Linking.openURL(job.url)} style={s.applyBtn} accessibilityRole="link">
            <Text style={s.applyText}>LinkedIn post ↗</Text>
          </Pressable>
        )}
        {!!job.applyEmail && (
          <Pressable
            onPress={() =>
              Linking.openURL(
                `mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application for ${job.title}${job.org && !job.title.includes(job.org) ? ` - ${job.org}` : ''}`)}`,
              )
            }
            style={s.applyBtn}
            accessibilityRole="link"
          >
            <Text style={s.applyText}>Email CV ✉</Text>
          </Pressable>
        )}
        {pdfs.map((n, i) => (
          <Pressable key={n.url} onPress={() => (n.inApp ? onPdf(n.url) : Linking.openURL(n.url))} style={s.applyBtn} accessibilityRole="button">
            <Text style={s.applyText}>
              {pdfs.length > 1 ? `Notice ${i + 1}` : n.inApp ? 'View notice' : 'Notice'} {n.inApp ? '📄' : '↗'}
            </Text>
          </Pressable>
        ))}
        {!!inst?.website && (
          <Pressable onPress={() => Linking.openURL(inst.website)} style={s.applyBtn} accessibilityRole="link">
            <Text style={s.applyText}>Website ↗</Text>
          </Pressable>
        )}
      </View>
      {job.source === 'LinkedIn' && !job.applyUrl && (
        <Text style={s.applyNote}>
          {job.applyEmail ? `Easy Apply needs your LinkedIn login, or email ${job.applyEmail}` : 'Easy Apply needs your LinkedIn login'}
        </Text>
      )}
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
  const [showFilters, setShowFilters] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);

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
  const activeCount = regions.length + (commerceOnly ? 1 : 0) + (topOnly ? 1 : 0) + (query.trim() ? 1 : 0);
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

      <View style={s.filterBar}>
        <Pressable onPress={() => setShowFilters((v) => !v)} style={s.filterToggle} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: showFilters }}>
          <Text style={s.filterToggleText}>
            {showFilters ? '▾' : '▸'} Search & filters{activeCount ? ` (${activeCount} on)` : ''}
          </Text>
        </Pressable>
        <Pressable onPress={() => setSort((v) => (v === 'match' ? 'newest' : 'match'))} hitSlop={6} accessibilityRole="button">
          <Text style={s.why}>{sort === 'match' ? 'Best match ⇅' : 'Newest ⇅'}</Text>
        </Pressable>
      </View>
      {showFilters && (
        <>
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
          </View>
        </>
      )}

      <PdfViewer doc={pdf} onClose={() => setPdf(null)} />
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
            onPdf={(url) => setPdf({ url, title: item.org || item.title })}
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
  applyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  applyBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  applyPrimary: { backgroundColor: C.accent },
  applyPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  applyText: { color: C.accent, fontWeight: '600', fontSize: 14 },
  applyNote: { fontSize: 12, color: C.muted, marginTop: 6 },
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
  seats: { backgroundColor: '#F4F0FB', borderRadius: 8, padding: 8, marginTop: 8, gap: 3 },
  seatLine: { fontSize: 13, lineHeight: 18, color: C.text },
  seatSubject: { fontWeight: '700', color: '#5B3B8C' },
  seatCats: { color: C.text },
  seatMuted: { fontSize: 12, color: C.muted },
  tagPosts: { backgroundColor: '#EFE7FB', color: '#5B3B8C' },
  rating: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  ratingText: { fontSize: 13, fontWeight: '600' },
  ratingMuted: { fontSize: 13, color: C.muted, fontWeight: '400' },
  instPanel: { backgroundColor: C.bg, borderRadius: 8, padding: 10, marginTop: 8, gap: 5 },
  instName: { fontSize: 14, fontWeight: '700', color: C.text },
  instText: { fontSize: 13, color: C.text, lineHeight: 18 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateLabel: { width: 118, fontSize: 12, color: C.muted },
  rateBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' },
  rateFill: { height: 6, borderRadius: 3 },
  rateNum: { width: 28, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  quoteHead: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 4, textTransform: 'uppercase' },
  quote: { fontSize: 13, color: C.text, fontStyle: 'italic', lineHeight: 18 },
  filterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 10 },
  filterToggle: { paddingVertical: 4 },
  filterToggleText: { fontSize: 14, fontWeight: '600', color: C.accent },
  empty: { textAlign: 'center', color: C.muted, marginTop: 40 },
});
