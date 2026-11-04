import type { WorkspaceState } from './status';

/**
 * Suspending idle Claude sessions to save memory (spec §9.8): when a session
 * may be suspended, and the profile's choices.
 */

/** Edit profile › General's choices, in minutes; off is no value. */
export const SUSPEND_CHOICES = [5, 10, 30] as const;
export type SuspendChoice = (typeof SUSPEND_CHOICES)[number];

/** The mark's tooltip on the sidebar row, in the Workspaces table and on a tab (spec §9.8). */
export const SUSPENDED_TOOLTIP = 'Suspended to save memory; resumes when you open it';

/** How long a resume waits for Claude's SessionStart before it counts as ready (spec §9.8). */
export const RESUME_READY_MS = 20_000;

/** What decides whether a running Claude session may be suspended now. */
export interface SuspendFacts {
  /** The profile's delay in minutes; null when suspension is off. */
  delayMin: number | null;
  /** Its workspace, or its main-checkout tab, is shown in a visible window. */
  shown: boolean;
  /** Its state from hooks (spec §10.2). Awaiting approval is worked out from Done or Waiting. */
  state: WorkspaceState;
  /** Claude's SessionStart arrived since it was started or resumed. */
  started: boolean;
  /** Claude's background tasks still running at the last Stop (spec §10.2). */
  background: number;
  /** Marked Keep running. */
  keepRunning: boolean;
  /** Text typed into Claude's prompt since the last prompt was sent. */
  draft: boolean;
  /** Being resumed: Claude isn't ready yet. */
  resuming: boolean;
}

export type SuspendBlocker =
  | 'off'
  | 'shown'
  | 'busy'
  | 'background'
  | 'kept'
  | 'draft'
  | 'resuming';

/** Idle states: Claude waits at its prompt (spec §9.8). */
const IDLE_STATES: readonly WorkspaceState[] = ['done', 'needs-input', 'interrupted'];

/**
 * Why the session can't be suspended now, or null when it may be. Never while
 * Claude works or asks for permission; a Claude in Starting only once its
 * SessionStart arrived (it was resumed or started and waits).
 */
export function suspendBlocker(facts: SuspendFacts): SuspendBlocker | null {
  if (facts.delayMin === null) return 'off';
  if (facts.resuming) return 'resuming';
  if (facts.keepRunning) return 'kept';
  if (facts.shown) return 'shown';
  const idle = IDLE_STATES.includes(facts.state) || (facts.state === 'starting' && facts.started);
  if (!idle) return 'busy';
  if (facts.background > 0) return 'background';
  if (facts.draft) return 'draft';
  return null;
}

/**
 * Whether a session that may be suspended since `eligibleSince` has been so
 * for the whole delay.
 */
export function suspendDue(
  eligibleSince: number,
  now: number,
  delayMin: number,
  minuteMs = 60_000,
): boolean {
  return now - eligibleSince >= delayMin * minuteMs;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: escape sequences start with ESC.
const SEQUENCES = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1bO.|\x1b./gs;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control keys aren't text.
const TEXT = /[^\x00-\x1f\x7f]/;

/**
 * Whether keys from a terminal view type text into Claude's prompt (a draft,
 * spec §9.8): printable characters, pasted text included. Escape sequences
 * (arrow keys, the paste markers, Alt+key, Esc), Enter, Backspace and other
 * control keys (⌃C) aren't.
 */
export function typesText(data: string): boolean {
  return TEXT.test(data.replace(SEQUENCES, ''));
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: the paste markers start with ESC.
const PASTE = /\x1b\[200~[\s\S]*?\x1b\[201~/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC ↵ is a new line in the prompt.
const NEW_LINE = /\x1b\r/g;

/**
 * Whether Claude's prompt holds a draft after these keys (spec §9.8): typed
 * text makes one; ↵ sends what is there (a prompt or a command such as
 * /model) and ends it, while ⇧↵ (ESC ↵) and pasted line breaks only add lines.
 */
export function draftAfter(draft: boolean, data: string): boolean {
  const keys = data
    .replace(PASTE, (pasted) => (typesText(pasted) ? 'x' : ''))
    .replace(NEW_LINE, 'x');
  const sent = keys.lastIndexOf('\r');
  if (sent >= 0) return typesText(keys.slice(sent + 1));
  return draft || typesText(keys);
}

/** "2 sessions suspended", for the memory tooltip and the project view (spec §6.14). */
export const suspendedNote = (count: number): string =>
  `${count} ${count === 1 ? 'session' : 'sessions'} suspended`;
