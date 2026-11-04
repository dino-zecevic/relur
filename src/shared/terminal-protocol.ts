/**
 * Terminal data travels over a dedicated MessagePort per attached view, not
 * over tRPC: output is batched in the main process, and the first message
 * after attaching replays the scrollback.
 */

/** IPC channel on which the main process hands a window its end of a terminal port. */
export const TERMINAL_PORT_CHANNEL = 'terminal-port';

export interface TerminalPortInfo {
  attachId: string;
  sessionId: string;
}

/**
 * A point in a Claude session's output where a hook event happened (spec
 * §6.8): a prompt was submitted (with its text, if the hook said), or a
 * response ended (with its text from the transcript, which its Copy button
 * copies). Views find the text in the lines above and put an xterm marker there.
 */
export type TerminalMark =
  | { kind: 'prompt'; text: string | null }
  | { kind: 'response'; text: string };

export type TerminalServerMessage =
  /** `marks` are positions within `data`. */
  | { type: 'replay'; data: string; marks?: { at: number; mark: TerminalMark }[] }
  | { type: 'data'; data: string }
  | { type: 'mark'; mark: TerminalMark }
  | { type: 'exit'; exitCode: number | null; signal: number | null };

export type TerminalClientMessage = { type: 'input'; data: string };

/**
 * `home`: the profile's home terminal (spec §6.7). `setup`: an install or
 * sign-in command of the setup check (§6.11).
 */
export type SessionKind = 'home' | 'shell' | 'claude' | 'setup';

export interface SessionInfo {
  id: string;
  kind: SessionKind;
  title: string;
  cwd: string;
  profileId: string;
  projectId: string | null;
  workspaceId: string | null;
  /**
   * `suspended`: Claude only, its process stopped to save memory while the
   * session stays, to be resumed (spec §9.8).
   */
  status: 'running' | 'suspended' | 'exited';
  /**
   * Claude only: true from spawn until its first output, at most about 3 s
   * (spec §6.3, launch spinner).
   */
  launching: boolean;
  /**
   * Claude only: true from a resume until Claude is ready (its SessionStart,
   * at most 20 s); keys typed meanwhile aren't sent (spec §9.8).
   */
  resuming: boolean;
  /** How many times it was resumed: each resume starts its output afresh, so views attach again. */
  generation: number;
  exitCode: number | null;
  signal: number | null;
}
