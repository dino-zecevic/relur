import { describe, expect, it } from 'vitest';
import { checkHold, HOLD_MINUTES, type Hold, runsCommand, startHold } from './hold';

const MIN = 1000;
const at = (minutes: number) => minutes * MIN;
const alive =
  (...commands: string[]) =>
  (command: string) =>
    commands.includes(command);

/** Runs the checks in order and returns the minute at which the hold's time was up. */
function doneAt(
  hold: Hold,
  checks: [minutes: number, running: ((command: string) => boolean) | null][],
): number | null {
  let current = hold;
  for (const [minutes, running] of checks) {
    const checked = checkHold(current, at(minutes), running, MIN);
    if (checked.done) return minutes;
    current = checked.hold;
  }
  return null;
}

describe('the hold of Done for background commands (spec §10.2)', () => {
  const hold = () => startHold(['./linux-check.sh'], 0);

  it('holds for as long as the process is alive, past the old 10 minutes', () => {
    const checks = [0, 5, 10, 20, 60, 119].map((m): [number, ReturnType<typeof alive>] => [
      m,
      alive('./linux-check.sh'),
    ]);
    expect(doneAt(hold(), checks)).toBeNull();
  });

  it('is up the grace after a found process is gone, when no hand-back came', () => {
    const gone = alive();
    expect(
      doneAt(hold(), [
        [0, alive('./linux-check.sh')],
        [20, gone],
        [21.9, gone],
        [22, gone],
      ]),
    ).toBe(20 + HOLD_MINUTES.grace);
  });

  it('starts the grace again when the process shows up again', () => {
    expect(
      doneAt(hold(), [
        [0, alive('./linux-check.sh')],
        [1, alive()],
        [2, alive('./linux-check.sh')],
        [3.5, alive()],
        [5, alive()],
        [5.5, alive()],
      ]),
    ).toBe(5.5);
  });

  it('keeps the old fixed fallback for a process never found', () => {
    const never = alive('something else');
    expect(
      doneAt(hold(), [
        [0, never],
        [5, never],
        [9.9, never],
        [10, never],
      ]),
    ).toBe(HOLD_MINUTES.fallback);
    // Nor does a process table that can't be read hasten or delay it.
    expect(
      doneAt(hold(), [
        [0, null],
        [9.9, null],
        [10, null],
      ]),
    ).toBe(10);
  });

  it('keeps a found process held while the table can’t be read', () => {
    expect(
      doneAt(hold(), [
        [0, alive('./linux-check.sh')],
        [5, null],
        [30, null],
      ]),
    ).toBeNull();
  });

  it('is up at the cap, even with the process alive', () => {
    expect(
      doneAt(hold(), [
        [0, alive('./linux-check.sh')],
        [119.9, alive('./linux-check.sh')],
        [120, alive('./linux-check.sh')],
      ]),
    ).toBe(HOLD_MINUTES.cap);
  });

  it('waits for every command: one gone and one never found keeps the fallback', () => {
    const both = startHold(['sleep 5', './watch-forever.sh'], 0);
    expect(
      doneAt(both, [
        [0, alive('sleep 5')],
        [1, alive()],
        [3, alive()],
        [9.9, alive()],
        [10, alive()],
      ]),
    ).toBe(10);
    // Two found: the later one's end counts.
    const two = startHold(['sleep 5', 'sleep 50'], 0);
    expect(
      doneAt(two, [
        [0, alive('sleep 5', 'sleep 50')],
        [1, alive('sleep 50')],
        [4, alive('sleep 50')],
        [50, alive()],
        [52, alive()],
      ]),
    ).toBe(52);
  });
});

describe('runsCommand', () => {
  const shell = (command: string) => ({
    args: `/bin/zsh -c source /c/shell-snapshots/snapshot-zsh-1.sh 2>/dev/null || true && eval '${command.replaceAll("'", "'\\''")}' < /dev/null && pwd -P >| /tmp/cwd`,
  });

  it("finds the command in its shell's arguments, as Claude Code starts it (checked live)", () => {
    expect(runsCommand(shell('sleep 90 && echo marker'), 'sleep 90 && echo marker')).toBe(true);
    expect(runsCommand(shell("echo 'quoted' && make"), "echo 'quoted' && make")).toBe(true);
    expect(runsCommand({ args: 'sleep 90' }, 'sleep 90 && echo marker')).toBe(false);
    expect(runsCommand(shell('sleep 90'), '')).toBe(false);
  });
});
