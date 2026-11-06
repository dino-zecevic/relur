import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '../shared/brand';

/**
 * Who an app is (spec §15.7): its id (the bundle id on macOS, the desktop
 * entry's name for an AppImage), its version, and the file that starts it
 * without `open`. Updating in the app checks it before anything is replaced.
 */
export interface AppIdentity {
  id: string;
  version: string;
  executable: string;
}

/** A `.app` bundle's Info.plist values, read with `plutil`. */
export function macIdentity(app: string): AppIdentity {
  const plist = path.join(app, 'Contents', 'Info.plist');
  const read = (key: string) =>
    execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
  return {
    id: read('CFBundleIdentifier'),
    version: read('CFBundleShortVersionString'),
    executable: path.join(app, 'Contents', 'MacOS', read('CFBundleExecutable')),
  };
}

/** The desktop entry inside an AppImage: `<linuxExecutable>.desktop`. */
export const APPIMAGE_DESKTOP_FILE = `${BRAND.linuxExecutable}.desktop`;

/**
 * An AppImage's identity from the desktop entry it carries, extracted with
 * `--appimage-extract` (no FUSE needed) into a scratch folder: its name is the
 * id, `X-AppImage-Version` (electron-builder writes it) the version.
 */
export function appImageIdentity(file: string): AppIdentity {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `${BRAND.slug}-appimage-`));
  try {
    execFileSync(file, ['--appimage-extract', APPIMAGE_DESKTOP_FILE], {
      cwd: scratch,
      stdio: 'ignore',
      timeout: 30_000,
    });
    const entry = fs.readFileSync(
      path.join(scratch, 'squashfs-root', APPIMAGE_DESKTOP_FILE),
      'utf8',
    );
    const version = /^X-AppImage-Version=(.+)$/m.exec(entry)?.[1]?.trim() ?? '';
    return { id: BRAND.linuxExecutable, version, executable: file };
  } catch {
    throw new Error(`${path.basename(file)} has no ${APPIMAGE_DESKTOP_FILE}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** What an update replaces: a `.app` bundle (macOS) or an AppImage (Linux). */
export type AppKind = 'app' | 'appimage';

export const appIdentity = (kind: AppKind, at: string): AppIdentity =>
  kind === 'app' ? macIdentity(at) : appImageIdentity(at);

/** The id an update must have: never anything else is installed (spec §15.7). */
export const expectedId = (kind: AppKind) =>
  kind === 'app' ? BRAND.bundleId : BRAND.linuxExecutable;

/** Throws when `at` isn't this app at `version`. */
export function checkIdentity(kind: AppKind, at: string, version: string): AppIdentity {
  let found: AppIdentity;
  try {
    found = appIdentity(kind, at);
  } catch (error) {
    throw new Error(
      `The download isn't ${BRAND.displayName}: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (found.id !== expectedId(kind)) {
    throw new Error(`The download is ${found.id}, not ${expectedId(kind)}`);
  }
  if (found.version !== version) {
    throw new Error(`The download is version ${found.version || 'unknown'}, not ${version}`);
  }
  return found;
}

/** `<helper> identity app|appimage <path>`: `<id> <version>`, for the Linux package check. */
export function runIdentity(args: string[]): number {
  const [kind, at] = args;
  if ((kind !== 'app' && kind !== 'appimage') || !at) {
    process.stderr.write('usage: identity app|appimage <path>\n');
    return 1;
  }
  try {
    const found = appIdentity(kind, at);
    process.stdout.write(`${found.id} ${found.version}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    return 1;
  }
}
