import { needsYou } from './status';
import { type PrStatus, type Workspace, workspaceMerged } from './workspaces';

/**
 * Home's Overview (spec §6.7): which of a profile's workspaces show in which
 * section. A workspace shows in one section at most, the first that applies:
 * Needs you, Working now, Clean up, Ready to ship.
 */
export type HomeSection = 'needs' | 'working' | 'clean' | 'ship';

export const HOME_SECTIONS: readonly HomeSection[] = ['needs', 'working', 'ship', 'clean'];

export const HOME_SECTION_TITLE: Record<HomeSection, string> = {
  needs: 'Needs you',
  working: 'Working now',
  ship: 'Ready to ship',
  clean: 'Clean up',
};

/** Rows a section shows before "Show all n" (spec §6.7). */
export const HOME_SECTION_LIMIT = 5;

/** What a Done workspace has left to ship, summed over its repositories. */
export interface ShipState {
  uncommitted: number;
  unpushed: number;
}

/** What a Ready to ship row offers: the first of these that applies (spec §6.7). */
export type ShipStep =
  | { kind: 'commit'; files: number }
  | { kind: 'push'; commits: number }
  | { kind: 'pr'; pr: PrStatus };

/** The main repository's open or draft PR, else the first linked one's. */
export function openPr(w: Pick<Workspace, 'repos' | 'pr'>): PrStatus | null {
  const open = (pr: PrStatus | null | undefined) =>
    pr && (pr.state === 'open' || pr.state === 'draft') ? pr : null;
  return (
    open(w.repos.find((r) => r.primary)?.pr ?? w.pr) ??
    w.repos.map((r) => open(r.pr)).find(Boolean) ??
    null
  );
}

/** Uncommitted files first, then unpushed commits, then an open pull request. */
export function shipStep(
  w: Pick<Workspace, 'repos' | 'pr'>,
  state: ShipState | null,
): ShipStep | null {
  if (state && state.uncommitted > 0) return { kind: 'commit', files: state.uncommitted };
  if (state && state.unpushed > 0) return { kind: 'push', commits: state.unpushed };
  const pr = openPr(w);
  return pr ? { kind: 'pr', pr } : null;
}

/** When the workspace began needing you: its state's start, or when Claude was cut off. */
export const needsSince = (w: Pick<Workspace, 'state' | 'stateSince' | 'unfinished'>) =>
  (needsYou(w.state) ? w.stateSince : w.unfinished?.since) ?? '';

/**
 * The section a workspace belongs in, or null for none. `ship` is what its
 * repositories have left to ship; null while unknown.
 */
export function homeSection(w: Workspace, ship: ShipState | null): HomeSection | null {
  if (needsYou(w.state) || w.unfinished) return 'needs';
  if (w.state === 'working') return 'working';
  if (workspaceMerged(w)) return 'clean';
  if (w.state === 'done' && shipStep(w, ship)) return 'ship';
  return null;
}

/**
 * The profile's workspaces by section, each in its order: Needs you oldest
 * first (as ⌘J goes), Working now longest first, the rest by last activity.
 */
export function homeSections(
  workspaces: Workspace[],
  ship: (workspaceId: string) => ShipState | null,
): Record<HomeSection, Workspace[]> {
  const out: Record<HomeSection, Workspace[]> = { needs: [], working: [], ship: [], clean: [] };
  for (const w of workspaces) {
    const section = homeSection(w, ship(w.id));
    if (section) out[section].push(w);
  }
  const activity = (w: Workspace) => w.lastActivityAt ?? w.createdAt;
  out.needs.sort((a, b) => needsSince(a).localeCompare(needsSince(b)));
  out.working.sort((a, b) => (a.stateSince ?? '').localeCompare(b.stateSince ?? ''));
  out.ship.sort((a, b) => activity(b).localeCompare(activity(a)));
  out.clean.sort((a, b) => activity(b).localeCompare(activity(a)));
  return out;
}

/** The workspaces that may be Ready to ship: their git state is worth asking for. */
export const shipCandidates = (workspaces: Workspace[]) =>
  workspaces.filter(
    (w) => !needsYou(w.state) && !w.unfinished && w.state === 'done' && !workspaceMerged(w),
  );

/** "#212" from a pull request's address, or null. */
export function prNumber(pr: Pick<PrStatus, 'url'>): string | null {
  const n = pr.url ? /\/(\d+)\/?$/.exec(pr.url)?.[1] : null;
  return n ? `#${n}` : null;
}

/** "PR #212 open", "PR draft", "PR #198 merged", "Likely merged" (spec §6.7). */
export function prText(pr: PrStatus): string {
  const n = prNumber(pr);
  const pull = n ? `PR ${n}` : 'PR';
  switch (pr.state) {
    case 'open':
      return `${pull} open`;
    case 'draft':
      return `${pull} draft`;
    case 'merged':
      return `${pull} merged`;
    case 'closed':
      return `${pull} closed`;
    case 'likely-merged':
      return 'Likely merged: the branch is gone from the remote';
  }
}

/** "working for 4 min", "working for 1 h 5 min", "working for less than a minute". */
export function workingFor(since: string | null, now = Date.now()): string {
  if (!since) return 'working';
  const minutes = Math.floor(Math.max(0, now - Date.parse(since)) / 60_000);
  if (minutes < 1) return 'working for less than a minute';
  if (minutes < 60) return `working for ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `working for ${h} h${m ? ` ${m} min` : ''}`;
}

/** The profile's projects with their own workspaces and those they are linked into (§21.1). */
export function projectCounts(
  projectIds: string[],
  workspaces: Pick<Workspace, 'projectId' | 'repos'>[],
): { projectId: string; count: number; linked: number }[] {
  return projectIds.map((projectId) => ({
    projectId,
    count: workspaces.filter((w) => w.projectId === projectId).length,
    linked: workspaces.filter(
      (w) => w.projectId !== projectId && w.repos.some((r) => r.projectId === projectId),
    ).length,
  }));
}
