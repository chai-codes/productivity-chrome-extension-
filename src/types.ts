export type SavedTab = { url: string; title: string; group: string };
export type Session = { id?: number; name: string; savedAt: number; tabs: SavedTab[] };
export type Stale = { id: number; title: string; url: string };
export type Task = { id: string; title: string; subject: string; deadline: string; priority: 'high' | 'medium' | 'low'; plannedMin: number; done: boolean; links: { url: string; title: string }[] };
export type Dwell = { id?: number; ts: number; day: string; subject: string; domain: string; ms: number };
export type Switch = { id?: number; ts: number; from: string; to: string };
export type Plan = { exam: string; date: string; hoursPerDay: number; subjects: string[]; start: number };
