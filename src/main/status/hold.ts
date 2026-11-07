import type { ProcessEntry } from '../memory/processes';

/**
 * How long Done is held for background commands (spec §10.2), in minutes:
 * a command whose process was never found keeps the old fixed fallback; one
 * found and then gone gets a grace for its hand-back; nothing is held longer
 * than the cap. The process table is read every `poll` minutes.
 */
export const HOLD_MINUTES = { fallback: 10, grace: 2, cap: 120, poll: 0.25 } as const;

/** One waited-for command of a held Done. */
export interface HeldCommand {
  command: string;
  /** Its process was found below Claude at least once during the hold. */
  found: boolean;
  /** When it was first missing after being found; null while it runs. */
  goneSince: number | null;
}

/** A held Done: since the Stop that started it, and the commands it waits for. */
export interface Hold {
  since: number;
  commands: HeldCommand[];
}

export const startHold = (commands: string[], now: number): Hold => ({
  since: now,
  commands: commands.map((command) => ({ command, found: false, goneSince: null })),
});

/**
 * One look at the process table (spec §10.2): `running` tells whether a
 * command's process is below Claude now, null when the table couldn't be read
 * (nothing is learnt then). Returns the hold as it now stands and whether its
 * time is up: past the cap, or every command settled, i.e. found and gone for
 * the grace, or never found for the fallback.
 */
export function checkHold(
  hold: Hold,
  now: number,
  running: ((command: string) => boolean) | null,
  minuteMs: number,
): { hold: Hold; done: boolean } {
  const commands = hold.commands.map((c): HeldCommand => {
    if (!running) return c;
    if (running(c.command)) return { ...c, found: true, goneSince: null };
    return c.found && c.goneSince === null ? { ...c, goneSince: now } : c;
  });
  const settled = (c: HeldCommand) =>
    c.found
      ? c.goneSince !== null && now - c.goneSince >= HOLD_MINUTES.grace * minuteMs
      : now - hold.since >= HOLD_MINUTES.fallback * minuteMs;
  const done =
    now - hold.since >= HOLD_MINUTES.cap * minuteMs ||
    (commands.length > 0 && commands.every(settled));
  return { hold: { ...hold, commands }, done };
}

/**
 * Whether a process runs a background command (checked live): Claude Code
 * starts each in its own shell, `zsh -c … eval '<command>' …`, so the command
 * line is in the shell's arguments, its single quotes written as `'\''`.
 */
export function runsCommand(process: Pick<ProcessEntry, 'args'>, command: string): boolean {
  if (!command.trim()) return false;
  return process.args.includes(command) || process.args.includes(command.replaceAll("'", "'\\''"));
}
