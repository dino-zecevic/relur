import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND } from '../shared/brand';
import { type AppKind, checkIdentity, macIdentity } from './app-identity';

/**
 * What the app hands the helper when it quits with an update ready (spec
 * §15.7), as a JSON file: `<helper> apply-update <plan.json>`.
 */
export interface UpdatePlan {
  /** The app's process: nothing is replaced while it runs. */
  pid: number;
  kind: AppKind;
  /** The installed app, replaced in place. */
  target: string;
  /** The checked new version, in the staging folder. */
  staged: string;
  version: string;
  /** Removed afterwards, whatever happened. */
  stagingDir: string;
  /** Where the outcome goes, for the window at the next start. */
  resultFile: string;
  /** Restart now: start the app afterwards, the new one or, after a failure, the old one. */
  relaunch: boolean;
  /** `open` (macOS, through LaunchServices) or `exec` (the executable: an AppImage, and tests). */
  launch: 'open' | 'exec';
  /** The started app's environment: the user's, not the quitting app's. */
  env: Record<string, string>;
}

/** The outcome, read by the app at its next start. */
export interface UpdateResult {
  version: string;
  ok: boolean;
  error?: string;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Copies when a rename can't cross filesystems; `ditto` keeps a bundle's signature and links. */
function moveInto(from: string, to: string, kind: AppKind): void {
  try {
    fs.renameSync(from, to);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
  }
  const tmp = path.join(path.dirname(to), `.${path.basename(to)}.new-${process.pid}`);
  try {
    if (kind === 'app') execFileSync('ditto', [from, tmp], { stdio: 'ignore' });
    else fs.copyFileSync(from, tmp);
    if (kind === 'appimage') fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, to);
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Replaces the app at `target` with `staged` (spec §15.7): the old one moves
 * aside to a hidden backup next to it, the new one takes its place, then the
 * backup goes. When the new one can't be put there, the old one comes back.
 * Never sudo: a folder the user can't write to fails the first step.
 */
export function swapApp(target: string, staged: string, kind: AppKind): void {
  const backup = path.join(path.dirname(target), `.${path.basename(target)}.old-${process.pid}`);
  fs.rmSync(backup, { recursive: true, force: true });
  try {
    fs.renameSync(target, backup);
  } catch (error) {
    throw new Error(`Couldn't move ${target} aside: ${reason(error)}`);
  }
  try {
    moveInto(staged, target, kind);
  } catch (error) {
    try {
      fs.renameSync(backup, target);
    } catch (restore) {
      throw new Error(
        `Couldn't put the new version in place (${reason(error)}), nor the old one back (${reason(restore)}): it is at ${backup}`,
      );
    }
    throw new Error(`Couldn't put the new version in place: ${reason(error)}`);
  }
  fs.rmSync(backup, { recursive: true, force: true });
}

/** Whether the process ended within `ms`. */
export async function processExited(pid: number, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; ; ) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true;
    }
    if (Date.now() >= end) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Starts the app at `target`, in its own session, as the user would. */
function launch(plan: UpdatePlan): void {
  const [file, args] =
    plan.launch === 'open'
      ? ['open', [plan.target]]
      : [plan.kind === 'app' ? macIdentity(plan.target).executable : plan.target, []];
  const child = spawn(file as string, args as string[], {
    env: plan.env,
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {});
  child.unref();
}

function writeResult(file: string, result: UpdateResult): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(result, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/**
 * Applies a staged update once the app has exited (spec §15.7): checks it is
 * this app at the expected version, swaps it in, records the outcome, removes
 * the staging folder and, after Restart now, starts the app again: the new
 * version, or the old one when the swap failed.
 */
export async function applyUpdate(plan: UpdatePlan, waitMs = 60_000): Promise<UpdateResult> {
  if (!(await processExited(plan.pid, waitMs))) {
    // Still running: nothing changes, and it stays ready for the next quit.
    const result = { version: plan.version, ok: false, error: `${BRAND.displayName} didn't quit` };
    writeResult(plan.resultFile, result);
    return result;
  }
  let result: UpdateResult = { version: plan.version, ok: true };
  try {
    checkIdentity(plan.kind, plan.staged, plan.version);
    swapApp(plan.target, plan.staged, plan.kind);
  } catch (error) {
    result = { version: plan.version, ok: false, error: reason(error) };
  }
  writeResult(plan.resultFile, result);
  fs.rmSync(plan.stagingDir, { recursive: true, force: true });
  if (plan.relaunch) {
    try {
      launch(plan);
    } catch {
      // Nothing to start: the user opens it.
    }
  }
  return result;
}

/** `<helper> apply-update <plan.json>`: started detached by the quitting app. */
export async function runApplyUpdate(args: string[]): Promise<number> {
  let plan: UpdatePlan;
  try {
    plan = JSON.parse(fs.readFileSync(args[0] ?? '', 'utf8')) as UpdatePlan;
    // It holds the user's environment: gone once read.
    fs.rmSync(args[0] ?? '', { force: true });
  } catch (error) {
    process.stderr.write(`apply-update: no plan: ${reason(error)}\n`);
    return 1;
  }
  return (await applyUpdate(plan)).ok ? 0 : 1;
}
