import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND } from '@shared/brand';
import { APPIMAGE_DESKTOP_FILE } from '../../helper/app-identity';

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Small stand-ins for the app, for updating inside the app (spec §15.7): a
 * `.app` bundle, signed ad hoc as releases are, and an AppImage that answers
 * `--appimage-extract` with its desktop entry. Started, each appends its
 * version to `marker`, so a test sees which one ran.
 */
export interface DummyOptions {
  version: string;
  /** Another id, for a download that isn't the app. */
  id?: string;
  marker: string;
}

/** `<dir>/<App>.app`, signed ad hoc (macOS only). */
export function makeDummyMacApp(dir: string, options: DummyOptions): string {
  const app = path.join(dir, `${BRAND.displayName}.app`);
  const contents = path.join(app, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.writeFileSync(
    path.join(contents, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${options.id ?? BRAND.bundleId}</string>
<key>CFBundleShortVersionString</key><string>${options.version}</string>
<key>CFBundleExecutable</key><string>${BRAND.displayName}</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`,
  );
  fs.writeFileSync(
    path.join(contents, 'MacOS', BRAND.displayName),
    `#!/bin/sh\necho ${options.version} >> ${quote(options.marker)}\n`,
    { mode: 0o755 },
  );
  execFileSync('codesign', ['-s', '-', '--force', app], { stdio: 'ignore' });
  return app;
}

/** A release's zip of an app, as `ditto` makes it (spec §15.4). */
export function zipMacApp(app: string, zip: string): string {
  execFileSync('ditto', ['-c', '-k', '--keepParent', app, zip]);
  return zip;
}

/** An executable AppImage stand-in at `file`. */
export function makeDummyAppImage(file: string, options: DummyOptions): string {
  const desktop = `[Desktop Entry]\nName=${BRAND.displayName}\nExec=AppRun %U\nType=Application\nX-AppImage-Version=${options.version}\n`;
  const name = options.id === undefined ? APPIMAGE_DESKTOP_FILE : `${options.id}.desktop`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `#!/bin/sh
if [ "$1" = --appimage-extract ]; then
  mkdir -p squashfs-root
  if [ "$2" = ${quote(name)} ]; then printf '%s' ${quote(desktop)} > squashfs-root/${quote(name)}; fi
  exit 0
fi
echo ${options.version} >> ${quote(options.marker)}
`,
    { mode: 0o755 },
  );
  return file;
}

/** The release asset for this platform: the zip of a dummy app, or a dummy AppImage. */
export function makeDummyPackage(
  dir: string,
  asset: string,
  options: DummyOptions,
): { file: string } {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'darwin') {
    const build = fs.mkdtempSync(path.join(dir, 'build-'));
    const app = makeDummyMacApp(build, options);
    zipMacApp(app, path.join(dir, asset));
    fs.rmSync(build, { recursive: true, force: true });
  } else {
    makeDummyAppImage(path.join(dir, asset), options);
  }
  return { file: path.join(dir, asset) };
}

/** The installed dummy at `target`, the app the update replaces. */
export function makeDummyInstall(target: string, options: DummyOptions): string {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (process.platform === 'darwin') {
    const app = makeDummyMacApp(path.dirname(target), options);
    if (app !== target) fs.renameSync(app, target);
    return target;
  }
  return makeDummyAppImage(target, options);
}
