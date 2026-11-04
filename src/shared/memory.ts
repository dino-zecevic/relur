/**
 * Memory used by Claude sessions (spec §6.14): resident memory of each
 * Claude session's process tree, measured by the main process.
 */

/** Memory of processes that share a label, e.g. "node dev server". */
export interface MemoryPart {
  label: string;
  bytes: number;
}

/** One running Claude session and every process it started. */
export interface SessionMemory {
  sessionId: string;
  profileId: string;
  projectId: string | null;
  /** Null for a session in a project's main checkout (Start Claude here). */
  workspaceId: string | null;
  /** The workspace's task id or name, or the project's name for its main checkout. */
  label: string;
  /** Claude's own process. */
  claude: number;
  /** Everything it started: MCP servers, shells, background commands, dev servers. */
  other: number;
  /** `other` by label, largest first. */
  otherParts: MemoryPart[];
}

export interface MemorySnapshot {
  /** When it was measured (ms since the epoch). */
  at: number;
  sessions: SessionMemory[];
  /** The app's own processes: Electron, its renderers and helpers. */
  app: number;
  /** The machine's total RAM, what the status bar's bar is relative to. */
  total: number;
}

/** A workspace's sessions together, or one main-checkout session. */
export interface MemoryGroup {
  key: string;
  label: string;
  claude: number;
  other: number;
  otherParts: MemoryPart[];
  total: number;
}

/** How often the main process measures while the window is visible (spec §6.14). */
export const MEMORY_INTERVAL_MS = 10_000;

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "340 MB", "1.2 GB", "12 GB" (spec §6.14). */
export function formatBytes(bytes: number): string {
  const mb = Math.round(bytes / MB);
  if (mb < 1000) return `${bytes > 0 ? Math.max(1, mb) : 0} MB`;
  const gb = bytes / GB;
  return gb < 100 ? `${gb.toFixed(1)} GB` : `${Math.round(gb)} GB`;
}

function addParts(into: Map<string, number>, parts: MemoryPart[]): void {
  for (const p of parts) into.set(p.label, (into.get(p.label) ?? 0) + p.bytes);
}

const sortedParts = (parts: Map<string, number>): MemoryPart[] =>
  [...parts]
    .map(([label, bytes]) => ({ label, bytes }))
    .sort((a, b) => b.bytes - a.bytes || a.label.localeCompare(b.label));

function group(key: string, label: string, sessions: SessionMemory[]): MemoryGroup {
  const parts = new Map<string, number>();
  let claude = 0;
  let other = 0;
  for (const s of sessions) {
    claude += s.claude;
    other += s.other;
    addParts(parts, s.otherParts);
  }
  return { key, label, claude, other, otherParts: sortedParts(parts), total: claude + other };
}

/** Each workspace's sessions summed, and each main-checkout session on its own; largest first. */
export function memoryGroups(sessions: SessionMemory[]): MemoryGroup[] {
  const byKey = new Map<string, SessionMemory[]>();
  for (const s of sessions) {
    const key = s.workspaceId ? `workspace:${s.workspaceId}` : `session:${s.sessionId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }
  return [...byKey]
    .map(([key, list]) => group(key, list[0]?.label ?? '', list))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** A workspace's sessions summed; null when none runs. */
export function workspaceMemory(
  snapshot: MemorySnapshot | null | undefined,
  workspaceId: string,
): MemoryGroup | null {
  const list = snapshot?.sessions.filter((s) => s.workspaceId === workspaceId) ?? [];
  return list.length > 0 ? group(`workspace:${workspaceId}`, list[0]?.label ?? '', list) : null;
}

/** The project's running sessions (its workspaces' and its main checkout's); null when none runs. */
export function projectMemory(
  snapshot: MemorySnapshot | null | undefined,
  projectId: string,
): { bytes: number; sessions: number } | null {
  const list = snapshot?.sessions.filter((s) => s.projectId === projectId) ?? [];
  if (list.length === 0) return null;
  return { bytes: list.reduce((sum, s) => sum + s.claude + s.other, 0), sessions: list.length };
}

/** Every running session's memory. */
export const sessionsTotal = (snapshot: MemorySnapshot): number =>
  snapshot.sessions.reduce((sum, s) => sum + s.claude + s.other, 0);

/** "Claude 300 MB, other 1.2 GB: node dev server, zsh" (at most three labels). */
export function describeSplit(g: Pick<MemoryGroup, 'claude' | 'other' | 'otherParts'>): string {
  const labels = g.otherParts.slice(0, 3).map((p) => p.label);
  const more = g.otherParts.length - labels.length;
  const names = labels.length > 0 ? `: ${labels.join(', ')}${more > 0 ? ` +${more}` : ''}` : '';
  return `Claude ${formatBytes(g.claude)}, other ${formatBytes(g.other)}${names}`;
}

/** The machine's RAM, in whole gigabytes: "16 GB" (spec §6.14). */
export function formatTotal(bytes: number): string {
  return bytes >= GB ? `${Math.round(bytes / GB)} GB` : formatBytes(bytes);
}

/** What the status bar counts: every running session and the app itself (spec §6.14). */
export const memoryUsed = (snapshot: MemorySnapshot): number =>
  sessionsTotal(snapshot) + snapshot.app;

/** How full the status bar's bar is: the used memory relative to the machine's RAM, 0–1. */
export function memoryShare(snapshot: MemorySnapshot): number {
  if (!(snapshot.total > 0)) return 0;
  return Math.min(1, Math.max(0, memoryUsed(snapshot) / snapshot.total));
}

/** At this share the bar turns `st-permission`, as plan usage does at 80 %. */
export const MEMORY_HIGH_SHARE = 0.8;
