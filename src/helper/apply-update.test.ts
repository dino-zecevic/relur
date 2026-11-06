import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '@shared/brand';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeDummyAppImage, makeDummyInstall } from '../main/test-support/dummy-app';
import type { AppKind } from './app-identity';
import { applyUpdate, processExited, swapApp, type UpdatePlan } from './apply-update';

const kind: AppKind = process.platform === 'darwin' ? 'app' : 'appimage';
const installedName = `${BRAND.displayName}.${kind === 'app' ? 'app' : 'AppImage'}`;
/** Root can write anywhere: the read-only folder can't fail a swap then. */
const isRoot = process.getuid?.() === 0;

let root: string;
let marker: string;
let target: string;
let stagingDir: string;
let staged: string;

/** A dummy app installed at `target` (1.0.0) and a staged one (2.0.0). */
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-update-'));
  marker = path.join(root, 'started');
  target = makeDummyInstall(path.join(root, 'Applications', installedName), {
    version: '1.0.0',
    marker,
  });
  stagingDir = path.join(root, 'data', 'update', '2.0.0');
  staged = makeDummyInstall(path.join(stagingDir, installedName), { version: '2.0.0', marker });
});

afterEach(() => {
  fs.chmodSync(path.dirname(target), 0o755);
  fs.rmSync(root, { recursive: true, force: true });
});

/** The version the app at `at` says it is: what it appends to the marker when started. */
const versionOf = (at: string) => {
  const exe = kind === 'app' ? path.join(at, 'Contents', 'MacOS', BRAND.displayName) : at;
  return fs.readFileSync(exe, 'utf8').match(/echo (\S+) >>/)?.[1];
};

const waitForFile = async (file: string) => {
  for (const end = Date.now() + 5000; Date.now() < end; ) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no ${file}`);
};

const plan = (overrides: Partial<UpdatePlan> = {}): UpdatePlan => ({
  // Not running: an exited child's pid.
  pid: 2 ** 22 + 12_345,
  kind,
  target,
  staged,
  version: '2.0.0',
  stagingDir,
  resultFile: path.join(root, 'data', 'update', 'result.json'),
  relaunch: false,
  launch: 'exec',
  env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
  ...overrides,
});

const backups = () => fs.readdirSync(path.dirname(target)).filter((name) => name !== installedName);

describe('swapApp', () => {
  it('replaces the app in place and leaves no backup', () => {
    swapApp(target, staged, kind);
    expect(versionOf(target)).toBe('2.0.0');
    expect(fs.existsSync(staged)).toBe(false);
    expect(backups()).toEqual([]);
  });

  it('puts the old app back when the new one cannot be moved in', () => {
    fs.rmSync(staged, { recursive: true });
    expect(() => swapApp(target, staged, kind)).toThrow(/Couldn't put the new version in place/);
    expect(versionOf(target)).toBe('1.0.0');
    expect(backups()).toEqual([]);
  });

  it.skipIf(isRoot)('leaves everything as it was in a folder the user cannot write to', () => {
    fs.chmodSync(path.dirname(target), 0o555);
    expect(() => swapApp(target, staged, kind)).toThrow(/Couldn't move .* aside/);
    fs.chmodSync(path.dirname(target), 0o755);
    expect(versionOf(target)).toBe('1.0.0');
    expect(versionOf(staged)).toBe('2.0.0');
  });
});

describe('processExited', () => {
  it('waits for the process to end, and gives up after the time', async () => {
    const child = spawn('sleep', ['0.3']);
    const pid = child.pid as number;
    expect(await processExited(pid, 50)).toBe(false);
    expect(await processExited(pid, 5000)).toBe(true);
  });
});

describe('applyUpdate', () => {
  it('swaps, records the result, removes the staging folder and starts the new version', async () => {
    const result = await applyUpdate(plan({ relaunch: true }));
    expect(result).toEqual({ version: '2.0.0', ok: true });
    expect(JSON.parse(fs.readFileSync(plan().resultFile, 'utf8'))).toEqual(result);
    expect(versionOf(target)).toBe('2.0.0');
    expect(fs.existsSync(stagingDir)).toBe(false);
    await waitForFile(marker);
    expect(fs.readFileSync(marker, 'utf8').trim()).toBe('2.0.0');
  });

  it('starts nothing after Later', async () => {
    await applyUpdate(plan());
    await new Promise((r) => setTimeout(r, 300));
    expect(fs.existsSync(marker)).toBe(false);
    expect(versionOf(target)).toBe('2.0.0');
  });

  it.skipIf(isRoot)('keeps and starts the old version when the swap fails', async () => {
    fs.chmodSync(path.dirname(target), 0o555);
    const result = await applyUpdate(plan({ relaunch: true }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Couldn't move .* aside/);
    expect(versionOf(target)).toBe('1.0.0');
    expect(fs.existsSync(stagingDir)).toBe(false);
    await waitForFile(marker);
    expect(fs.readFileSync(marker, 'utf8').trim()).toBe('1.0.0');
  });

  it('never installs another app, nor another version', async () => {
    fs.rmSync(staged, { recursive: true });
    if (kind === 'app')
      makeDummyInstall(staged, { version: '2.0.0', id: 'com.example.other', marker });
    else makeDummyAppImage(staged, { version: '2.0.0', id: 'other', marker });
    const other = await applyUpdate(plan());
    expect(other.ok).toBe(false);
    expect(versionOf(target)).toBe('1.0.0');

    fs.mkdirSync(stagingDir, { recursive: true });
    makeDummyInstall(staged, { version: '3.0.0', marker });
    const version = await applyUpdate(plan());
    expect(version).toMatchObject({ ok: false, error: 'The download is version 3.0.0, not 2.0.0' });
    expect(versionOf(target)).toBe('1.0.0');
  });

  it('changes nothing while the app still runs', async () => {
    const result = await applyUpdate(plan({ pid: process.pid, relaunch: true }), 200);
    expect(result).toMatchObject({ ok: false, error: `${BRAND.displayName} didn't quit` });
    expect(versionOf(target)).toBe('1.0.0');
    expect(fs.existsSync(staged)).toBe(true);
    expect(fs.existsSync(marker)).toBe(false);
  });
});
