import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import './style.css';
import { all, clearAll, del } from './db';
import { classify, DEFAULT_SUBJECTS, getCfg } from './classify';
import { restoreSession } from './actions';
import type { Dwell, Plan, Session, Switch, Task } from './types';

function useStore<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(init);
  useEffect(() => { chrome.storage.local.get(key).then((r) => { if (r[key] !== undefined) setV(r[key]); }); }, [key]);
  return [v, (n: T) => { setV(n); chrome.storage.local.set({ [key]: n }); }];
}
const mins = (ms: number) => Math.round(ms / 60000);
const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return <>{rows.map(([l, v]) => <div className="bar" key={l}><span className="lab">{l}</span><div className="track"><div className="fill" style={{ width: `${(v / max) * 100}%` }} /></div><span>{fmt(v)}</span></div>)}</>;
}

function Analytics() {
  const [days, setDays] = useState(7);
  const [dwell, setDwell] = useState<Dwell[]>([]);
  const [sw, setSw] = useState<Switch[]>([]);
  useEffect(() => { all<Dwell>('dwell').then(setDwell); all<Switch>('switches').then(setSw); }, []);
  const since = Date.now() - days * 86400000;
  const d = dwell.filter((x) => x.ts >= since).sort((a, b) => a.ts - b.ts);
  const s = sw.filter((x) => x.ts >= since);
  const bySubject: Record<string, number> = {}, byDomain: Record<string, number> = {};
  d.forEach((x) => { bySubject[x.subject] = (bySubject[x.subject] ?? 0) + mins(x.ms); byDomain[x.domain] = (byDomain[x.domain] ?? 0) + mins(x.ms); });
  // A browsing session ends after a 30-minute gap with no activity.
  const sessions: number[] = []; let cur = 0, last = 0;
  d.forEach((x) => { if (last && x.ts - last > 30 * 60000) { sessions.push(cur); cur = 0; } cur += x.ms; last = x.ts; });
  if (cur) sessions.push(cur);
  const total = d.reduce((a, x) => a + x.ms, 0);
  const ctx = s.filter((x) => x.from !== x.to).length;
  const top = (o: Record<string, number>, n: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  return (
    <>
      <div className="row"><select value={days} onChange={(e) => setDays(+e.target.value)}><option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></div>
      <div className="card stats">
        <div className="stat"><b>{fmt(mins(total))}</b>active browsing</div>
        <div className="stat"><b>{sessions.length}</b>sessions</div>
        <div className="stat"><b>{sessions.length ? fmt(mins(total / sessions.length)) : '0m'}</b>avg session</div>
        <div className="stat"><b>{s.length}</b>tab switches</div>
        <div className="stat"><b>{ctx}</b>context switches</div>
      </div>
      <div className="card"><h2>Time by subject</h2>{total ? <Bars rows={top(bySubject, 10)} /> : <span className="muted">No data yet. Browse for a few minutes with tracking on.</span>}</div>
      <div className="card"><h2>Top sites</h2>{total ? <Bars rows={top(byDomain, 8)} /> : <span className="muted">No data yet.</span>}</div>
    </>
  );
}

function Tasks() {
  const [tasks, setTasks] = useStore<Task[]>('tasks', []);
  const [subjects, setSubjects] = useState<string[]>(Object.keys(DEFAULT_SUBJECTS));
  const [f, setF] = useState({ title: '', subject: '', deadline: '', priority: 'medium' as Task['priority'], plannedMin: 60 });
  useEffect(() => { getCfg().then((c) => { const k = Object.keys(c.subjects); setSubjects(k); setF((p) => ({ ...p, subject: k[0] ?? '' })); }); }, []);
  const rank = { high: 0, medium: 1, low: 2 };
  const sorted = [...tasks].sort((a, b) => +a.done - +b.done || a.deadline.localeCompare(b.deadline) || rank[a.priority] - rank[b.priority]);
  const patch = (id: string, p: Partial<Task>) => setTasks(tasks.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const attach = async (t: Task) => {
    const cfg = await getCfg(); const links: Task['links'] = [];
    for (const tab of await chrome.tabs.query({})) if (tab.url?.startsWith('http') && (await classify(tab.url, tab.title ?? '', cfg)) === t.subject) links.push({ url: tab.url, title: tab.title ?? tab.url });
    patch(t.id, { links });
  };
  return (
    <>
      <div className="card row">
        <input placeholder="Task, e.g. Finish DP problem set" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Task['priority'] })}><option>high</option><option>medium</option><option>low</option></select>
        <input type="number" min={5} step={5} value={f.plannedMin} onChange={(e) => setF({ ...f, plannedMin: +e.target.value })} style={{ width: 80 }} title="Planned minutes" />
        <button className="primary" onClick={() => { if (!f.title.trim()) return; setTasks([...tasks, { ...f, id: crypto.randomUUID(), done: false, links: [] }]); setF({ ...f, title: '' }); }}>Add task</button>
      </div>
      {sorted.length === 0 && <div className="muted">No tasks yet. Add one above and attach your open tabs to it.</div>}
      {sorted.map((t) => (
        <div className="card" key={t.id}>
          <div className="item" style={{ border: 0 }}>
            <label className={t.done ? 'done' : ''}><input type="checkbox" checked={t.done} onChange={(e) => patch(t.id, { done: e.target.checked })} /> {t.title}</label>
            <span className="muted">{t.subject} · due {t.deadline || 'no date'} · <span className={`pri-${t.priority}`}>{t.priority}</span> · {t.plannedMin}m</span>
          </div>
          <div className="row">
            <button onClick={() => attach(t)}>Attach open {t.subject} tabs</button>
            {t.links.length > 0 && <button onClick={() => t.links.forEach((l) => chrome.tabs.create({ url: l.url, active: false }))}>Open {t.links.length} linked tabs</button>}
            <button onClick={() => setTasks(tasks.filter((x) => x.id !== t.id))}>Delete</button>
          </div>
        </div>
      ))}
    </>
  );
}

function Planner() {
  const [plan, setPlan] = useStore<Plan | null>('plan', null);
  const [dwell, setDwell] = useState<Dwell[]>([]);
  const [f, setF] = useState({ exam: '', date: '', hoursPerDay: 3, subjects: 'DAA, ML' });
  useEffect(() => { all<Dwell>('dwell').then(setDwell); }, []);
  const create = () => setPlan({ exam: f.exam, date: f.date, hoursPerDay: f.hoursPerDay, subjects: f.subjects.split(',').map((s) => s.trim()).filter(Boolean), start: Date.now() });
  let rows: { subject: string; planned: number; actual: number }[] = [], daysLeft = 0;
  if (plan) {
    daysLeft = Math.max(1, Math.ceil((new Date(plan.date).getTime() - plan.start) / 86400000));
    const total = daysLeft * plan.hoursPerDay * 60, each = Math.round(total / Math.max(1, plan.subjects.length));
    rows = plan.subjects.map((s) => ({ subject: s, planned: each, actual: mins(dwell.filter((d) => d.subject === s && d.ts >= plan.start).reduce((a, d) => a + d.ms, 0)) }));
  }
  const max = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.actual)));
  return (
    <>
      <div className="card row">
        <input placeholder="Exam name" value={f.exam} onChange={(e) => setF({ ...f, exam: e.target.value })} />
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input type="number" min={1} max={16} value={f.hoursPerDay} onChange={(e) => setF({ ...f, hoursPerDay: +e.target.value })} style={{ width: 70 }} title="Hours per day" />
        <input placeholder="Subjects, comma separated" value={f.subjects} onChange={(e) => setF({ ...f, subjects: e.target.value })} style={{ flex: 1 }} />
        <button className="primary" onClick={create} disabled={!f.exam || !f.date}>Create revision plan</button>
      </div>
      {!plan && <div className="muted">Enter an exam date and daily hours. TabFlow splits the time across subjects and compares it with what you actually studied.</div>}
      {plan && (
        <div className="card">
          <h2>{plan.exam}: {daysLeft} days left, {plan.hoursPerDay}h per day</h2>
          {rows.map((r) => (
            <div className="bar" key={r.subject}><span className="lab">{r.subject}</span>
              <div className="track" style={{ height: 20 }}><div className="fill plan" style={{ width: `${(r.planned / max) * 100}%` }} /><div className="fill act" style={{ width: `${(r.actual / max) * 100}%` }} /></div>
              <span>{fmt(r.actual)} of {fmt(r.planned)}</span></div>
          ))}
          <div className="muted">Light bar is planned time, dark bar is time actually spent in that subject since the plan started.</div>
          <button onClick={() => setPlan(null)}>Delete plan</button>
        </div>
      )}
    </>
  );
}

function Workspaces() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const load = () => all<Session>('sessions').then((s) => setSessions(s.reverse()));
  useEffect(() => { load(); }, []);
  const merge = async (a: Session, b: Session) => {
    const { add } = await import('./db');
    await add('sessions', { name: `${a.name} + ${b.name}`, savedAt: Date.now(), tabs: [...a.tabs, ...b.tabs] }); load();
  };
  return (
    <>
      {sessions.length === 0 && <div className="muted">No saved workspaces. Save one from the TabFlow popup.</div>}
      {sessions.map((s, i) => (
        <div className="card" key={s.id}>
          <div className="item" style={{ border: 0 }}><b>{s.name}</b><span className="muted">{s.tabs.length} tabs · {new Date(s.savedAt).toLocaleDateString()}</span></div>
          <div className="row">
            <button className="primary" onClick={() => restoreSession(s)}>Restore</button>
            {sessions[i + 1] && <button onClick={() => merge(s, sessions[i + 1])}>Merge with next</button>}
            <button onClick={async () => { await del('sessions', s.id!); load(); }}>Delete</button>
          </div>
        </div>
      ))}
    </>
  );
}

function Settings() {
  const [subjects, setSubjects] = useStore<Record<string, string[]>>('subjects', DEFAULT_SUBJECTS);
  const [overrides, setOverrides] = useStore<Record<string, string>>('overrides', {});
  const [idle, setIdle] = useStore<number>('idleMinutes', 30);
  const [tracking, setTracking] = useStore<boolean>('tracking', true);
  const [sText, setSText] = useState(''), [oText, setOText] = useState('');
  useEffect(() => { setSText(Object.entries(subjects).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n')); }, [subjects]);
  useEffect(() => { setOText(Object.entries(overrides).map(([k, v]) => `${k} = ${v}`).join('\n')); }, [overrides]);
  const saveS = () => setSubjects(Object.fromEntries(sText.split('\n').filter((l) => l.includes(':')).map((l) => { const [k, ...r] = l.split(':'); return [k.trim(), r.join(':').split(',').map((x) => x.trim()).filter(Boolean)]; })));
  const saveO = () => setOverrides(Object.fromEntries(oText.split('\n').filter((l) => l.includes('=')).map((l) => { const [k, v] = l.split('='); return [k.trim(), v.trim()]; })));
  return (
    <>
      <div className="card"><h2>Privacy</h2>
        <label><input type="checkbox" checked={tracking} onChange={(e) => setTracking(e.target.checked)} /> Track active-tab time</label>
        <p className="muted">Only the subject, site domain and duration are stored, never page contents. Everything stays in this browser. Nothing is uploaded.</p>
        <button onClick={async () => { if (confirm('Delete all tracked activity and saved sessions?')) { await clearAll(); await chrome.storage.local.remove(['pairs', 'lastActive', 'stale']); } }}>Delete all activity data</button></div>
      <div className="card"><h2>Idle tab prompt</h2><label>Flag tabs untouched for <input type="number" min={5} value={idle} onChange={(e) => setIdle(+e.target.value)} style={{ width: 70 }} /> minutes</label></div>
      <div className="card"><h2>Subjects and keywords</h2><p className="muted">One per line: Subject: keyword, keyword</p><textarea value={sText} onChange={(e) => setSText(e.target.value)} /><button className="primary" onClick={saveS}>Save subjects</button></div>
      <div className="card"><h2>Manual corrections</h2><p className="muted">Force a site into a subject, one per line: leetcode.com = DAA</p><textarea value={oText} onChange={(e) => setOText(e.target.value)} /><button className="primary" onClick={saveO}>Save corrections</button></div>
    </>
  );
}

function App() {
  const tabs = ['Analytics', 'Tasks', 'Planner', 'Workspaces', 'Settings'] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>('Analytics');
  return (
    <div className="wrap">
      <h1>TabFlow</h1>
      <nav>{tabs.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
      {tab === 'Analytics' && <Analytics />}{tab === 'Tasks' && <Tasks />}{tab === 'Planner' && <Planner />}{tab === 'Workspaces' && <Workspaces />}{tab === 'Settings' && <Settings />}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
