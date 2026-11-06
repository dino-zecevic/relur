import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { BRAND } from '@shared/brand';
import { compareVersions } from '@shared/updates';
import { type AppKind, checkIdentity } from '../../helper/app-identity';

const run = promisify(execFile);

/** A checked update, waiting in the staging folder for the next quit (spec §15.7). */
export interface Staged {
  version: string;
  kind: AppKind;
  /** The new `.app` or AppImage. */
  app: string;
  /** Its staging folder, `<data dir>/update/<version>`. */
  dir: string;
}

/** `<data dir>/update`: the staging folders, the helper's plan and its result. */
export const updateRoot = (dataDir: string) => path.join(dataDir, 'update');
const MANIFEST = 'staged.json';

/** The staged app's name: `<App>.app` or `<App>.AppImage`, as installed. */
export const stagedName = (kind: AppKind) =>
  `${BRAND.displayName}.${kind === 'app' ? 'app' : 'AppImage'}`;

const message = (error: unknown) =>
  (error as { stderr?: string }).stderr?.trim() ||
  (error instanceof Error ? error.message : String(error));

/**
 * Unpacks and checks a verified download in `dir` (spec §15.7). A zip is
 * unpacked with `ditto`, which keeps the bundle's links, attributes and code
 * signature, and the signature must still verify; an AppImage becomes
 * executable. Either way it must be this app (`BRAND`'s bundle id, or its
 * desktop entry's name) at `version`. Records the result in `staged.json`.
 */
export async function stageDownload(
  kind: AppKind,
  download: string,
  dir: string,
  version: string,
): Promise<Staged> {
  const app = path.join(dir, stagedName(kind));
  fs.rmSync(app, { recursive: true, force: true });
  if (kind === 'app') {
    const unpacked = path.join(dir, 'unpacked');
    fs.rmSync(unpacked, { recursive: true, force: true });
    try {
      await run('ditto', ['-x', '-k', download, unpacked]);
    } catch (error) {
      throw new Error(`The download couldn't be unpacked: ${message(error)}`);
    }
    const found = fs.readdirSync(unpacked).filter((name) => name.endsWith('.app'));
    if (found.length !== 1 || !found[0]) {
      throw new Error(`The download has ${found.length === 0 ? 'no app' : 'several apps'} in it`);
    }
    fs.renameSync(path.join(unpacked, found[0]), app);
    fs.rmSync(unpacked, { recursive: true, force: true });
    fs.rmSync(download, { force: true });
    try {
      await run('codesign', ['--verify', '--deep', '--strict', app]);
    } catch (error) {
      throw new Error(`The download's signature doesn't verify: ${message(error)}`);
    }
  } else {
    fs.renameSync(download, app);
    fs.chmodSync(app, 0o755);
  }
  checkIdentity(kind, app, version);
  const staged: Staged = { version, kind, app, dir };
  fs.writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify(staged, null, 2)}\n`);
  return staged;
}

/**
 * The staged update that survived a restart, if it is newer than `current`;
 * every other staging folder (older, unfinished or broken) is removed.
 */
export function readStaged(dataDir: string, current: string): Staged | null {
  const root = updateRoot(dataDir);
  let best: Staged | null = null;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const folders = entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name));
  for (const dir of folders) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')) as Staged;
      const newer = compareVersions(s.version, current);
      if (
        s.dir === dir &&
        (s.kind === 'app' || s.kind === 'appimage') &&
        newer !== null &&
        newer > 0 &&
        fs.existsSync(s.app) &&
        (!best || (compareVersions(s.version, best.version) ?? 0) > 0)
      ) {
        best = s;
      }
    } catch {
      // not a finished staging
    }
  }
  for (const dir of folders) {
    if (dir !== best?.dir) fs.rmSync(dir, { recursive: true, force: true });
  }
  return best;
}
