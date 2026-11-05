import type { MemoryPart } from '@shared/memory';
import type { ProcessEntry } from './processes';

/** A process table indexed for walking down from a process. */
export interface ProcessTree {
  byPid: Map<number, ProcessEntry>;
  children: Map<number, ProcessEntry[]>;
}

export function processTree(entries: ProcessEntry[]): ProcessTree {
  const byPid = new Map<number, ProcessEntry>();
  const children = new Map<number, ProcessEntry[]>();
  for (const e of entries) {
    byPid.set(e.pid, e);
    // pid 0 and init are their own parents on some systems.
    if (e.ppid === e.pid) continue;
    const list = children.get(e.ppid);
    if (list) list.push(e);
    else children.set(e.ppid, [e]);
  }
  return { byPid, children };
}

/** Every process below `pid`, at any depth, without `pid` itself. */
export function descendants(tree: ProcessTree, pid: number): ProcessEntry[] {
  const found: ProcessEntry[] = [];
  const seen = new Set<number>([pid]);
  const queue = [pid];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of tree.children.get(next) ?? []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      found.push(child);
      queue.push(child.pid);
    }
  }
  return found;
}

const MCP = /(^|[\s/@_-])mcp([\s/._-]|$)|modelcontextprotocol/i;
const DEV_SERVER =
  /(^|[\s/])(vite|next\s+dev|nuxt\s+dev|webpack(-dev-server|\s+serve)|nodemon|astro\s+dev|remix\s+dev|ng\s+serve|rails\s+s(erver)?|runserver|uvicorn|flask\s+run|http\.server|(npm|pnpm|yarn|bun)(\s+run)?\s+(dev|start|serve))(\s|$)/i;

/**
 * Whether a command line looks like a dev server (vite, `npm run dev`,
 * runserver, …). Claude's background commands are judged by it too (spec
 * §10.2), so the memory panel and the status agree.
 */
export const looksLikeDevServer = (command: string) => DEV_SERVER.test(command);

/** "node dev server", "node MCP server", or the process name ("zsh"). */
export function processLabel(p: Pick<ProcessEntry, 'name' | 'args'>): string {
  if (MCP.test(p.args)) return `${p.name} MCP server`;
  if (looksLikeDevServer(p.args)) return `${p.name} dev server`;
  return p.name;
}

/** A Claude session's memory: its own process, and everything below it by label. */
export function measureSession(
  tree: ProcessTree,
  pid: number,
): { claude: number; other: number; otherParts: MemoryPart[] } | null {
  const root = tree.byPid.get(pid);
  if (!root) return null;
  const parts = new Map<string, number>();
  let other = 0;
  for (const p of descendants(tree, pid)) {
    other += p.rss;
    const label = processLabel(p);
    parts.set(label, (parts.get(label) ?? 0) + p.rss);
  }
  const otherParts = [...parts]
    .filter(([, bytes]) => bytes > 0)
    .map(([label, bytes]) => ({ label, bytes }))
    .sort((a, b) => b.bytes - a.bytes || a.label.localeCompare(b.label));
  return { claude: root.rss, other, otherParts };
}

/**
 * The app's own memory: its processes (Electron's list) as the process table
 * measures them, or Electron's own figure for one the table doesn't have.
 */
export function appMemory(
  tree: ProcessTree,
  processes: { pid: number; fallbackBytes: number }[],
): number {
  return processes.reduce((sum, p) => sum + (tree.byPid.get(p.pid)?.rss ?? p.fallbackBytes), 0);
}
