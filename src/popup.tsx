import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import './style.css';
import { autoGroup, duplicates, restoreSession, saveSession } from './actions';
import { all, add } from './db';
import type { Session, Stale } from './types';

function Popup() {
  const [stale, setStale] = useState<Stale[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setStale((await chrome.storage.local.get('stale')).stale ?? []);
    setSessions((await all<Session>('sessions')).reverse());
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (f: () => Promise<string>) => { setMsg(await f()); load(); };
  const drop = async (id: number) => {
    const next = stale.filter((s) => s.id !== id);
    await chrome.storage.local.set({ stale: next });
    chrome.action.setBadgeText({ text: next.length ? String(next.length) : '' });
    setStale(next);
  };
  const keep = async (s: Stale) => { const { lastActive = {} } = await chrome.storage.local.get('lastActive'); lastActive[s.id] = Date.now(); await chrome.storage.local.set({ lastActive }); drop(s.id); };
  const later = async (s: Stale) => { await add('sessions', { name: `Read later: ${s.title.slice(0, 40)}`, savedAt: Date.now(), tabs: [{ url: s.url, title: s.title, group: '' }] }); await chrome.tabs.remove(s.id); drop(s.id); load(); };
  const close = async (s: Stale) => { await chrome.tabs.remove(s.id); drop(s.id); };

  return (
    <>
      <h1>TabFlow</h1>
      <div className="row">
        <button className="primary" onClick={() => run(async () => `Grouped into ${await autoGroup()} workspaces`)}>Group tabs</button>
        <button onClick={() => run(async () => { const n = await saveSession(`Session ${new Date().toLocaleString()}`); return `Saved ${n} tabs`; })}>Save session</button>
        <button onClick={() => run(async () => { const d = await duplicates(); if (d.length) await chrome.tabs.remove(d); return `Closed ${d.length} duplicates`; })}>Close duplicates</button>
        <button onClick={() => chrome.runtime.openOptionsPage()}>Dashboard</button>
      </div>
      <div className="msg" role="status">{msg}</div>

      <h2>Idle tabs ({stale.length})</h2>
      {stale.length === 0 && <div className="muted">No idle tabs. Tabs untouched for a while will show up here.</div>}
      {stale.map((s) => (
        <div className="item" key={s.id}>
          <span className="t" title={s.url}>{s.title}</span>
          <span className="row"><button onClick={() => keep(s)}>Keep</button><button onClick={() => later(s)}>Later</button><button onClick={() => close(s)}>Close</button></span>
        </div>
      ))}

      <h2>Saved sessions</h2>
      {sessions.length === 0 && <div className="muted">Nothing saved yet. Use Save session to store this window.</div>}
      {sessions.slice(0, 6).map((s) => (
        <div className="item" key={s.id}>
          <span className="t">{s.name} <span className="muted">({s.tabs.length})</span></span>
          <button onClick={() => restoreSession(s)}>Restore</button>
        </div>
      ))}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Popup />);
