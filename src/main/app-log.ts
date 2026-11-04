import fs from 'node:fs';
import path from 'node:path';

/** The log's name in the app config dir (spec §3.4). */
export const APP_LOG_FILE = 'app.log';
/** A log larger than this at start is moved to `app.old.log`, replacing the one there. */
const MAX_BYTES = 1024 * 1024;

/**
 * The app's log (spec §3.4): one line per timed phase of creating a workspace
 * and of a task lookup, for finding what makes them slow. Writing never fails
 * the work it describes.
 */
export class AppLog {
  constructor(readonly file: string) {
    try {
      if (fs.statSync(file).size > MAX_BYTES) {
        fs.renameSync(file, file.replace(/\.log$/, '.old.log'));
      }
    } catch {
      // no log yet
    }
  }

  write(line: string): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // a log that can't be written is skipped
    }
  }

  /** Times the phases of one operation; each line starts with `subject`. */
  timer(subject: string): PhaseTimer {
    return new PhaseTimer(this, subject);
  }
}

const ms = (since: number) => `${Math.round(performance.now() - since)} ms`;

/** The phases of one operation, each logged with its duration as it ends. */
export class PhaseTimer {
  readonly started = performance.now();

  constructor(
    private readonly log: AppLog | null,
    private readonly subject: string,
  ) {}

  /** Runs one phase and logs how long it took, and whether it failed. */
  async time<T>(phase: string, run: () => Promise<T> | T): Promise<T> {
    const start = performance.now();
    try {
      const result = await run();
      this.note(`${phase} ${ms(start)}`);
      return result;
    } catch (error) {
      this.note(`${phase} ${ms(start)} (failed)`);
      throw error;
    }
  }

  /** A phase measured by the caller from `start` (a `performance.now()`). */
  since(phase: string, start: number): void {
    this.note(`${phase} ${ms(start)}`);
  }

  /** The time since the timer started, under `label`. */
  total(label = 'total'): void {
    this.since(label, this.started);
  }

  note(text: string): void {
    this.log?.write(`${this.subject}: ${text}`);
  }
}
