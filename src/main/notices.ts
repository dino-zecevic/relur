import fs from 'node:fs';
import path from 'node:path';

/**
 * Notices shown once ever (spec §5), recorded in `notices.json` in the app
 * config dir: `{ "<id>": "<when it was shown>" }`. A file of its own rather
 * than state.db, so recording one never changes the database's schema.
 */
export type NoticeId =
  | 'window-closed'
  /** Suspending idle sessions turned on by default (spec §9.8). */
  | 'suspend-default';

const FILE = 'notices.json';

function read(configDir: string): Record<string, string> {
  try {
    const record: unknown = JSON.parse(fs.readFileSync(path.join(configDir, FILE), 'utf8'));
    return record !== null && typeof record === 'object' && !Array.isArray(record)
      ? (record as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function wasShown(configDir: string, id: NoticeId): boolean {
  return id in read(configDir);
}

/** Records the notice as shown, so it never is again. */
export function markShown(configDir: string, id: NoticeId): void {
  const file = path.join(configDir, FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(
      tmp,
      `${JSON.stringify({ ...read(configDir), [id]: new Date().toISOString() }, null, 2)}\n`,
    );
    fs.renameSync(tmp, file);
  } catch {
    // Not recorded: the notice may show once more.
    fs.rmSync(tmp, { force: true });
  }
}
