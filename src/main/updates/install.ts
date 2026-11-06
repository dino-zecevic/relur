import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { type Arch, BRAND, releaseAsset } from '@shared/brand';
import { debUpdate, INSTALL_COMMAND, type Release } from '@shared/updates';
import type { AppKind } from '../../helper/app-identity';

/**
 * How this copy of the app updates (spec §15.7): `self` downloads and replaces
 * itself where it runs; `terminal` can't, and says why (Update in terminal
 * remains); `deb` shows the apt command; `source` can't update at all.
 */
export type UpdateWay =
  | { kind: 'self'; app: AppKind; target: string; asset: string }
  | { kind: 'terminal'; why: string }
  | { kind: 'deb' }
  | { kind: 'source' };

export interface WhereItRuns {
  platform: NodeJS.Platform;
  arch: string;
  /** An Intel build under Rosetta: updates to Apple Silicon, as install.sh does. */
  translated: boolean;
  packaged: boolean;
  /** `process.execPath`. */
  exePath: string;
  /** `APPIMAGE`: the AppImage it runs from. */
  appImage: string | undefined;
  /** Test hook (`<PREFIX>UPDATE_TARGET`): replace this app instead. */
  testTarget?: string;
  writable(dir: string): boolean;
}

/** Works out how this installation updates (spec §15.7). */
export function updateWay(at: WhereItRuns): UpdateWay {
  const arch: Arch = at.arch === 'arm64' || at.translated ? 'arm64' : 'x64';
  const mac = at.platform === 'darwin';
  const asset = releaseAsset(arch, mac ? 'zip' : 'AppImage');
  if (at.testTarget) {
    return { kind: 'self', app: mac ? 'app' : 'appimage', target: at.testTarget, asset };
  }
  if (!at.packaged) return { kind: 'source' };
  const unwritable = (target: string): UpdateWay | null =>
    at.writable(path.dirname(target))
      ? null
      : {
          kind: 'terminal',
          why: `${BRAND.displayName} can't replace itself in ${path.dirname(target)}, a folder you can't write to.`,
        };
  if (mac) {
    const target = /^(.*?\.app)\/Contents\/MacOS\//.exec(at.exePath)?.[1];
    if (!target) return { kind: 'terminal', why: `${BRAND.displayName} isn't in an app bundle.` };
    if (target.includes('/AppTranslocation/')) {
      return {
        kind: 'terminal',
        why: `macOS runs ${BRAND.displayName} from a temporary copy: move it to Applications first.`,
      };
    }
    if (target.startsWith('/Volumes/')) {
      return {
        kind: 'terminal',
        why: `${BRAND.displayName} runs from the disk image: drag it to Applications first.`,
      };
    }
    return unwritable(target) ?? { kind: 'self', app: 'app', target, asset };
  }
  if (at.platform === 'linux') {
    if (!at.appImage) return { kind: 'deb' };
    return unwritable(at.appImage) ?? { kind: 'self', app: 'appimage', target: at.appImage, asset };
  }
  return { kind: 'terminal', why: 'Run this in a terminal.' };
}

/**
 * What Update in terminal did (spec §15.7): opened the user's terminal running
 * the install command, or the command to run by hand, with Copy: when no
 * terminal was found, and for a .deb, whose apt command needs the user.
 */
export type UpdateAction =
  | { kind: 'terminal' }
  | { kind: 'command'; command: string; link: string | null; why: string };

/** How this copy of the app was installed, as far as Update cares. */
export interface Installation {
  platform: NodeJS.Platform;
  arch: string;
  /** Running from an AppImage (`APPIMAGE` is set). */
  appImage: boolean;
  packaged: boolean;
  /** The environment the terminal gets: the user's login shell's, not the app's. */
  env: Record<string, string>;
  /** Test hook: `none` finds no terminal. */
  terminal?: string;
  /** Where the macOS `.command` file is written: the app's update folder. */
  commandDir: string;
}

/** Linux terminals, in order, with how each runs a command (spec §15.7). */
const LINUX_TERMINALS: [string, string[]][] = [
  ['x-terminal-emulator', ['-e']],
  ['gnome-terminal', ['--']],
  ['konsole', ['-e']],
];

function onPath(name: string, env: Record<string, string>): string | null {
  for (const dir of (env.PATH ?? '').split(':').filter(Boolean)) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {
      // not here
    }
  }
  return null;
}

const byHand = (why: string): UpdateAction => ({
  kind: 'command',
  command: INSTALL_COMMAND,
  link: null,
  why,
});

/**
 * Update in terminal, and Update for a .deb (spec §15.7): the way the README
 * installs, in the user's terminal; never sudo. The install command asks
 * before it quits the app, installs, and offers to open it again.
 */
export async function startUpdate(release: Release, at: Installation): Promise<UpdateAction> {
  if (at.platform === 'linux' && at.packaged && !at.appImage) {
    const deb = debUpdate(release, at.arch);
    return {
      kind: 'command',
      command: deb.command,
      link: deb.url,
      why: 'Installed with apt: run this in a terminal.',
    };
  }
  if (at.terminal === 'none') return byHand('No terminal found: run this in one.');
  if (at.platform === 'darwin') {
    // A .command file opens in whatever terminal the user made the default for
    // it (Terminal, or one such as iTerm2 that made itself the default).
    const file = path.join(at.commandDir, `${BRAND.slug}-update.command`);
    try {
      fs.mkdirSync(at.commandDir, { recursive: true });
      fs.writeFileSync(file, `#!/bin/sh\n${INSTALL_COMMAND}\n`, { mode: 0o755 });
      fs.chmodSync(file, 0o755);
    } catch {
      return byHand("The terminal didn't open: run this in one.");
    }
    const opened = await new Promise<boolean>((resolve) =>
      execFile('open', [file], { timeout: 15_000 }, (error) => resolve(!error)),
    );
    return opened ? { kind: 'terminal' } : byHand("The terminal didn't open: run this in one.");
  }
  if (at.platform === 'linux') {
    // Kept open at the end, so its output can be read.
    const command = `${INSTALL_COMMAND}; printf '\\nPress Enter to close. '; read _`;
    for (const [name, run] of LINUX_TERMINALS) {
      const file = onPath(name, at.env);
      if (!file) continue;
      try {
        // Its own session: it outlives the app, which the install command quits.
        const child = spawn(file, [...run, 'sh', '-c', command], {
          env: at.env,
          detached: true,
          stdio: 'ignore',
        });
        // A failure after the start can't be reported here; it mustn't crash the app.
        child.on('error', () => {});
        child.unref();
        return { kind: 'terminal' };
      } catch {
        // the next one
      }
    }
    return byHand('No terminal found: run this in one.');
  }
  return byHand('Run this in a terminal.');
}
