/**
 * Every name-related value in the app. Renaming the product means editing this
 * file only; `npm run check:name` fails if the name appears anywhere else.
 */
const displayName = 'Relur';
const slug = 'relur';
/** The GitHub repository releases are published from (install.sh, the release workflow). */
const github = { owner: 'relur-dev', repo: slug } as const;

export const BRAND = {
  /** Shown in window titles, menus and notifications. */
  displayName,
  /** Lowercase, filesystem- and shell-safe form of the name. */
  slug,
  /**
   * macOS bundle ID and Windows AppUserModelID. Fixed: it was made from the
   * repository's first owner, and changing it makes macOS treat the app as new
   * (it asks again for notifications), so it stays when the repository moves.
   */
  bundleId: `io.github.dino-zecevic.${slug}`,
  github,
  /** Prefix of every environment variable the app sets, e.g. `<prefix>WORKSPACE_ID`. */
  envPrefix: `${slug.toUpperCase()}_`,
  /** Folder in the user's home directory (default worktree root, user scripts). */
  homeDirName: `.${slug}`,
  /** Folder inside repositories and worktrees (task file, per-repo config). */
  repoDirName: `.${slug}`,
  /** Name of the helper executable that Claude Code hooks call (M1). */
  helperCommand: `${slug}-helper`,
  /** The command line tool (`<slug> add`, spec §7.5), a launcher that runs the helper. */
  cliCommand: slug,
  /**
   * The app's executable on Linux, and its desktop entry's name (`<it>.desktop`,
   * also the Wayland app id); not `<slug>`, which is the command line tool.
   */
  linuxExecutable: `${slug}-desktop`,
  /**
   * The app's previous name, used only to carry over what it left behind:
   * its settings folder, worktrees and task files, a repository's config,
   * its environment variables, its command line launcher and app bundle.
   * `npm run check:name` allows these names here and nowhere else.
   */
  legacy: {
    displayName: 'Orrery',
    slug: 'orrery',
    envPrefix: 'ORRERY_',
    homeDirName: '.orrery',
    repoDirName: '.orrery',
    cliCommand: 'orrery',
  },
} as const;

/** Name of an app-specific environment variable, e.g. `envVar('WORKSPACE_ID')`. */
export function envVar(name: string): string {
  return `${BRAND.envPrefix}${name}`;
}

/** A CPU architecture the app is built for, on macOS and on Linux. */
export type Arch = 'arm64' | 'x64';

/** A release asset's kind: the Mac's zip and dmg (spec §15.4), Linux's AppImage and deb (§15.6). */
export type AssetExt = 'zip' | 'dmg' | 'AppImage' | 'deb';

/**
 * Release asset names, without a version so the latest release is always at
 * the same URL: `<name>-mac-arm64.zip`, `<name>-linux-x64.AppImage`, and `SHA256SUMS`.
 */
export const releaseAsset = (arch: Arch, ext: AssetExt) =>
  `${BRAND.displayName}-${ext === 'zip' || ext === 'dmg' ? 'mac' : 'linux'}-${arch}.${ext}`;
export const CHECKSUMS_FILE = 'SHA256SUMS';
