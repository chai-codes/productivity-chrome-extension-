export const DEFAULT_SUBJECTS: Record<string, string[]> = {
  DAA: ['algorithm', 'daa', 'leetcode', 'dynamic programming', 'graph', 'complexity', 'geeksforgeeks', 'sorting'],
  ML: ['machine learning', 'neural', 'kaggle', 'pytorch', 'tensorflow', 'scikit', 'regression', 'deep learning'],
  Placement: ['interview', 'placement', 'resume', 'naukri', 'linkedin', 'hackerrank', 'codeforces', 'system design'],
  Assignments: ['assignment', 'lab manual', 'submission', 'classroom', 'moodle'],
  Distraction: ['youtube', 'netflix', 'instagram', 'reddit', 'twitter', 'x.com'],
};

export const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function getCfg() {
  const r = await chrome.storage.local.get(['subjects', 'overrides', 'pairs', 'idleMinutes', 'tracking']);
  return {
    subjects: (r.subjects ?? DEFAULT_SUBJECTS) as Record<string, string[]>,
    overrides: (r.overrides ?? {}) as Record<string, string>,   // manual corrections: domain -> subject
    pairs: (r.pairs ?? {}) as Record<string, number>,           // tab-switch co-occurrence: "a.com|b.com" -> count
    idleMinutes: (r.idleMinutes ?? 30) as number,
    tracking: (r.tracking ?? true) as boolean,
  };
}
type Cfg = Awaited<ReturnType<typeof getCfg>>;

function byKeywords(text: string, cfg: Cfg) {
  text = text.toLowerCase();
  let best = '', score = 0;
  for (const [s, kws] of Object.entries(cfg.subjects)) {
    const n = kws.filter((k) => text.includes(k.toLowerCase())).length;
    if (n > score) { best = s; score = n; }
  }
  return best;
}

/** 1) manual override  2) keyword match on title+URL  3) subject of the domain you switch to/from most  4) Unsorted */
export async function classify(url: string, title: string, cfg?: Cfg): Promise<string> {
  cfg ??= await getCfg();
  const d = domainOf(url);
  if (cfg.overrides[d]) return cfg.overrides[d];
  const direct = byKeywords(`${title} ${url}`, cfg);
  if (direct) return direct;
  const neighbours = Object.entries(cfg.pairs).filter(([k]) => k.split('|').includes(d)).sort((a, b) => b[1] - a[1]);
  for (const [k, count] of neighbours) {
    if (count < 3) break;
    const other = k.split('|').find((x) => x !== d)!;
    const s = cfg.overrides[other] || byKeywords(other, cfg);
    if (s) return s;
  }
  return 'Unsorted';
}
