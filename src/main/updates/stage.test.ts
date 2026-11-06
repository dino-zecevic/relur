import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '@shared/brand';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppKind } from '../../helper/app-identity';
import { makeDummyPackage } from '../test-support/dummy-app';
import { readStaged, stageDownload, stagedName, updateRoot } from './stage';

const mac = process.platform === 'darwin';
const kind: AppKind = mac ? 'app' : 'appimage';
const asset = mac ? 'App-mac-arm64.zip' : 'App-linux-x64.AppImage';

let dataDir: string;
let marker: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-'));
  marker = path.join(dataDir, 'started');
});
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const download = (version: string, id?: string) => {
  const dir = path.join(updateRoot(dataDir), version);
  return { dir, file: makeDummyPackage(dir, asset, { version, id, marker }).file };
};

describe('stageDownload', () => {
  it('unpacks and checks the download, keeping its signature, and records it', async () => {
    const { dir, file } = download('2.0.0');
    const staged = await stageDownload(kind, file, dir, '2.0.0');
    expect(staged).toEqual({ version: '2.0.0', kind, app: path.join(dir, stagedName(kind)), dir });
    expect(fs.existsSync(staged.app)).toBe(true);
    // Unpacked, or moved into place.
    expect(fs.existsSync(file)).toBe(false);
    if (!mac) expect(fs.statSync(staged.app).mode & 0o111).toBeTruthy();
    expect(readStaged(dataDir, '1.0.0')).toEqual(staged);
  });

  it('refuses another app and another version', async () => {
    const other = download('2.0.0', mac ? 'com.example.other' : 'other');
    await expect(stageDownload(kind, other.file, other.dir, '2.0.0')).rejects.toThrow(
      mac ? `The download is com.example.other, not ${BRAND.bundleId}` : /isn't/,
    );
    const version = download('3.0.0');
    await expect(stageDownload(kind, version.file, version.dir, '2.0.0')).rejects.toThrow(
      'The download is version 3.0.0, not 2.0.0',
    );
  });

  it.runIf(mac)('refuses a bundle whose signature no longer verifies', async () => {
    const { dir, file } = download('2.0.0');
    // A changed file inside the zip: unpacked, the signature no longer matches.
    const work = fs.mkdtempSync(path.join(dataDir, 'tamper-'));
    const { execFileSync } = await import('node:child_process');
    execFileSync('ditto', ['-x', '-k', file, work]);
    fs.appendFileSync(
      path.join(work, `${BRAND.displayName}.app`, 'Contents', 'MacOS', BRAND.displayName),
      '# changed\n',
    );
    fs.rmSync(file);
    execFileSync('ditto', [
      '-c',
      '-k',
      '--keepParent',
      path.join(work, `${BRAND.displayName}.app`),
      file,
    ]);
    await expect(stageDownload(kind, file, dir, '2.0.0')).rejects.toThrow(
      /signature doesn't verify/,
    );
  });
});

describe('readStaged', () => {
  it('keeps the newest staged update newer than this version, and removes the rest', async () => {
    for (const version of ['1.5.0', '2.0.0']) {
      const { dir, file } = download(version);
      await stageDownload(kind, file, dir, version);
    }
    // An unfinished download: no staged.json.
    fs.mkdirSync(path.join(updateRoot(dataDir), '3.0.0'));
    fs.writeFileSync(path.join(updateRoot(dataDir), 'result.json'), '{}');
    expect(readStaged(dataDir, '1.0.0')?.version).toBe('2.0.0');
    expect(fs.readdirSync(updateRoot(dataDir)).sort()).toEqual(['2.0.0', 'result.json']);
    // Once that version runs, it is gone too.
    expect(readStaged(dataDir, '2.0.0')).toBeNull();
    expect(fs.readdirSync(updateRoot(dataDir))).toEqual(['result.json']);
  });
});
