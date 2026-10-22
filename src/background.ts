import { add } from './db';
import { classify, domainOf, getCfg } from './classify';

type Cur = { tabId: number; url: string; title: string; since: number; subject: string };
const getCur = async () => (await chrome.storage.session.get('cur')).cur as Cur | null | undefined;
const setCur = (cur: Cur | null) => chrome.storage.session.set({ cur });

/** Close out the running dwell timer and write it to IndexedDB. */
async function flush() {
  const c = await getCur();
  if (!c) return;
  const ms = Date.now() - c.since;
  if (ms > 1000) await add('dwell', { ts: Date.now(), day: new Date().toISOString().slice(0, 10), subject: c.subject, domain: domainOf(c.url), ms });
  await setCur(null);
}

/** Start timing a tab; log the context switch and update the domain co-switch graph. */
async function begin(tabId: number) {
  const prev = await getCur();
  await flush();
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (!t?.url?.startsWith('http')) return;
  const cfg = await getCfg();
  if (!cfg.tracking) return;
  const subject = await classify(t.url, t.title ?? '', cfg);
  if (prev && prev.tabId !== tabId) {
    await add('switches', { ts: Date.now(), from: prev.subject, to: subject });
    const a = domainOf(prev.url), b = domainOf(t.url);
    if (a && b && a !== b) {
      const key = [a, b].sort().join('|');
      const { pairs = {} } = await chrome.storage.local.get('pairs');
      pairs[key] = (pairs[key] ?? 0) + 1;
      await chrome.storage.local.set({ pairs });
    }
  }
  const { lastActive = {} } = await chrome.storage.local.get('lastActive');
  lastActive[tabId] = Date.now();
  await chrome.storage.local.set({ lastActive });
  await setCur({ tabId, url: t.url, title: t.title ?? '', since: Date.now(), subject });
}

chrome.tabs.onActivated.addListener((i) => begin(i.tabId));
chrome.tabs.onUpdated.addListener((id, ch, tab) => { if (ch.status === 'complete' && tab.active) begin(id); });
chrome.tabs.onRemoved.addListener(async (id) => { if ((await getCur())?.tabId === id) await flush(); });
chrome.windows.onFocusChanged.addListener(async (w) => {
  if (w === chrome.windows.WINDOW_ID_NONE) return flush();
  const [t] = await chrome.tabs.query({ active: true, windowId: w });
  if (t?.id) begin(t.id);
});
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (s) => {
  if (s === 'active') { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (t?.id) begin(t.id); }
  else await flush();
});

// Every minute: checkpoint the running timer (service workers can be killed) and look for stale tabs.
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('tick', { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'tick') return;
  const c = await getCur();
  if (c) await begin(c.tabId);
  const cfg = await getCfg();
  const { lastActive = {} } = await chrome.storage.local.get('lastActive');
  const now = Date.now();
  const stale: { id: number; title: string; url: string }[] = [];
  for (const t of await chrome.tabs.query({})) {
    if (!t.id || t.active || t.pinned || t.audible || !t.url?.startsWith('http')) continue;
    lastActive[t.id] ??= now;
    if (now - lastActive[t.id] > cfg.idleMinutes * 60_000) stale.push({ id: t.id, title: t.title ?? t.url, url: t.url });
  }
  await chrome.storage.local.set({ lastActive, stale });
  chrome.action.setBadgeText({ text: stale.length ? String(stale.length) : '' });
});
