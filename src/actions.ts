import { add } from './db';
import { classify, getCfg } from './classify';
import type { Session } from './types';

const COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;

/** Cluster the current window's tabs into native Chrome tab groups, one per subject. */
export async function autoGroup(): Promise<number> {
  const cfg = await getCfg();
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const by: Record<string, number[]> = {};
  for (const t of tabs) {
    if (!t.id || t.pinned || !t.url?.startsWith('http')) continue;
    const s = await classify(t.url, t.title ?? '', cfg);
    if (s !== 'Unsorted') (by[s] ??= []).push(t.id);
  }
  let i = 0;
  for (const [subject, ids] of Object.entries(by)) {
    const gid = await chrome.tabs.group({ tabIds: ids });
    await chrome.tabGroups.update(gid, { title: subject, color: COLORS[i++ % COLORS.length] });
  }
  return Object.keys(by).length;
}

/** Save the current window (with group names) as a restorable workspace. */
export async function saveSession(name: string): Promise<number> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  const titles = Object.fromEntries(groups.map((g) => [g.id, g.title ?? '']));
  const items = tabs.filter((t) => t.url?.startsWith('http')).map((t) => ({ url: t.url!, title: t.title ?? '', group: t.groupId >= 0 ? titles[t.groupId] : '' }));
  await add('sessions', { name, savedAt: Date.now(), tabs: items });
  return items.length;
}

/** One-click restore: reopens every tab and rebuilds its tab groups. */
export async function restoreSession(s: Session) {
  const by: Record<string, number[]> = {};
  for (const t of s.tabs) {
    const tab = await chrome.tabs.create({ url: t.url, active: false });
    (by[t.group || '_'] ??= []).push(tab.id!);
  }
  for (const [g, ids] of Object.entries(by)) {
    if (g === '_') continue;
    const gid = await chrome.tabs.group({ tabIds: ids });
    await chrome.tabGroups.update(gid, { title: g });
  }
}

const normalise = (u: string) => {
  try { const x = new URL(u); x.hash = ''; [...x.searchParams.keys()].filter((k) => k.startsWith('utm_')).forEach((k) => x.searchParams.delete(k)); return x.href; } catch { return u; }
};

/** IDs of tabs whose URL (ignoring #hash and utm_ params) already appears in an earlier tab. */
export async function duplicates(): Promise<number[]> {
  const tabs = await chrome.tabs.query({});
  const seen = new Set<string>(); const dups: number[] = [];
  for (const t of tabs) {
    if (!t.id || !t.url?.startsWith('http')) continue;
    const k = normalise(t.url);
    if (seen.has(k)) dups.push(t.id); else seen.add(k);
  }
  return dups;
}
