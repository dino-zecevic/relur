import { spawn } from 'node:child_process';
import {
  claudeLookupArgs,
  cleanTitle,
  type LookupResult,
  lookupFailed,
  lookupNotFound,
  parseClaudeLookup,
} from '@shared/lookup';
import type { TaskLookup } from '@shared/schemas';
import { shellQuote } from '@shared/shell';
import { type AppLog, PhaseTimer } from '../app-log';

/** Output beyond this is dropped. */
const MAX_OUTPUT = 1024 * 1024;
/** After SIGTERM, a lookup that hasn't exited gets SIGKILL. */
const KILL_AFTER_MS = 2000;

/** Where and how a lookup runs: the profile's environment, in the project's repository. */
export interface LookupContext {
  shell: string;
  env: Record<string, string>;
  cwd: string;
  /** The profile's Claude, resolved on its PATH; null when it isn't found. */
  claudeCommand: string | null;
  /** Its skill sources, as `--plugin-dir`. */
  pluginDirs: string[];
}

export interface Exited {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
}

/**
 * Runs a process in its own process group, so a timeout or Cancel also stops
 * what it started (a connector's server, a tracker CLI's helpers).
 */
export function runProcess(
  run: { command: string; args: string[]; cwd: string; env: Record<string, string> },
  timeoutSec: number,
  onCancel: (cancel: () => void) => void,
): Promise<Exited> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    const child = spawn(run.command, run.args, {
      cwd: run.cwd,
      env: run.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const stop = () => {
      const kill = (signal: NodeJS.Signals) => {
        try {
          if (child.pid) process.kill(-child.pid, signal);
        } catch {
          // already gone
        }
      };
      kill('SIGTERM');
      setTimeout(() => kill('SIGKILL'), KILL_AFTER_MS).unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutSec * 1000);
    onCancel(() => {
      cancelled = true;
      stop();
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf8');
    });
    const done = (code: number | null) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, cancelled });
    };
    child.on('error', (error) => {
      stderr += error.message;
      done(null);
    });
    child.on('close', (code) => done(code));
  });
}

/** The first lines of what a failed lookup printed, for its message. */
const excerpt = (text: string) => {
  const lines = text.trim().split('\n').slice(0, 3).join(' ').trim();
  return lines.length > 300 ? `${lines.slice(0, 300)}…` : lines;
};

export interface LookupRequest {
  requestId: string;
  profileId: string;
  projectId: string | null;
  taskId: string;
  lookup: TaskLookup;
  /** New workspace's: a title found before for this profile and id is used again. */
  remember?: boolean;
}

/** Claude's own account of a print-mode run: its time, the API's share and its turns. */
function claudeStats(stdout: string): string | null {
  try {
    const result = JSON.parse(stdout.trim().split('\n').pop() ?? '');
    if (typeof result?.duration_ms !== 'number') return null;
    return `claude reports ${result.duration_ms} ms, API ${result.duration_api_ms ?? '?'} ms, ${result.num_turns ?? '?'} turns`;
  } catch {
    return null;
  }
}

/**
 * Task lookups (spec §13.7): finds a task's title from its id with the
 * profile's Claude (`claude -p`) or a command, stopped after its timeout or
 * on Cancel. Errors come back as results, for the dialog to show.
 */
export class TaskLookupService {
  private readonly running = new Map<string, () => void>();
  /** Titles New workspace found, per profile and id, for the app's run (spec §13.7). */
  private readonly titles = new Map<string, string>();

  constructor(
    private readonly context: (
      profileId: string,
      projectId: string | null,
    ) => Promise<LookupContext>,
    /** Where each lookup's phases are timed (spec §3.4). */
    private readonly log: AppLog | null = null,
  ) {}

  async run(request: LookupRequest): Promise<LookupResult> {
    const timer = new PhaseTimer(this.log, `lookup ${request.taskId} (${request.profileId})`);
    const key = `${request.profileId}\n${request.taskId}`;
    const known = request.remember ? this.titles.get(key) : undefined;
    if (known !== undefined) {
      timer.note('remembered');
      return { ok: true, title: known };
    }
    // A Stop before the process runs (while its environment is read) is kept for it.
    const stop = { stopped: false };
    this.running.set(request.requestId, () => {
      stop.stopped = true;
    });
    let result: LookupResult;
    try {
      result = await this.lookUp(request, timer, stop);
    } finally {
      this.running.delete(request.requestId);
    }
    if (result.ok && request.remember) this.titles.set(key, result.title);
    timer.note(
      result.ok ? 'found' : `${result.notFound ? 'not found' : 'failed'}: ${result.message}`,
    );
    timer.total();
    return result;
  }

  private async lookUp(
    { requestId, taskId, lookup, ...options }: LookupRequest,
    timer: PhaseTimer,
    stop: { stopped: boolean },
  ): Promise<LookupResult> {
    let context: LookupContext;
    try {
      context = await timer.time('environment', () =>
        this.context(options.profileId, options.projectId),
      );
    } catch (error) {
      return lookupFailed(error instanceof Error ? error.message : String(error));
    }
    if (stop.stopped) return lookupFailed('Cancelled');
    let run: { command: string; args: string[] };
    if (lookup.kind === 'prompt') {
      if (!context.claudeCommand) return lookupFailed("The profile's Claude was not found on PATH");
      run = {
        command: context.claudeCommand,
        args: claudeLookupArgs(
          lookup,
          lookup.prompt.replaceAll('{id}', taskId),
          context.pluginDirs,
        ),
      };
    } else {
      run = {
        command: context.shell,
        args: ['-c', lookup.command.replaceAll('{id}', shellQuote(taskId))],
      };
    }
    const exited = await timer.time(lookup.kind === 'prompt' ? 'claude -p' : 'command', () =>
      runProcess({ ...run, cwd: context.cwd, env: context.env }, lookup.timeoutSec, (cancel) =>
        this.running.set(requestId, cancel),
      ),
    );
    if (lookup.kind === 'prompt') {
      const stats = claudeStats(exited.stdout);
      if (stats) timer.note(stats);
    }
    if (exited.cancelled) return lookupFailed('Cancelled');
    if (exited.timedOut) return lookupFailed(`The lookup timed out after ${lookup.timeoutSec} s`);
    if (lookup.kind === 'prompt') {
      // A refusal or an error is in the JSON, whatever the exit code.
      const parsed = parseClaudeLookup(exited.stdout, taskId);
      if (parsed.ok || exited.stdout.trim()) return parsed;
    }
    if (exited.code !== 0) {
      const why = excerpt(exited.stderr) || excerpt(exited.stdout);
      return lookupFailed(`The lookup failed (exit ${exited.code ?? '?'})${why ? `: ${why}` : ''}`);
    }
    const title = cleanTitle(exited.stdout, taskId);
    return title ? { ok: true, title } : lookupNotFound('The lookup printed nothing');
  }

  /** Forgets a profile's titles, when its lookup changed. */
  forget(profileId: string): void {
    for (const key of this.titles.keys()) {
      if (key.startsWith(`${profileId}\n`)) this.titles.delete(key);
    }
  }

  cancel(requestId: string): void {
    this.running.get(requestId)?.();
  }

  dispose(): void {
    for (const cancel of this.running.values()) cancel();
  }
}
