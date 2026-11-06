import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDigest, parseChecksums, sha256File } from './checksum';

const a = 'a'.repeat(64);
const b = 'B'.repeat(64);

describe('parseChecksums', () => {
  it('reads sha256sum lines, text and binary mode, and skips the rest', () => {
    const sums = parseChecksums(
      `${a}  App-mac-arm64.zip\n${b} *App-linux-x64.AppImage\r\nnot a line\n\n${'c'.repeat(63)}  short\n`,
    );
    expect([...sums]).toEqual([
      ['App-mac-arm64.zip', a],
      ['App-linux-x64.AppImage', 'b'.repeat(64)],
    ]);
  });
});

describe('checkDigest', () => {
  const sums = parseChecksums(`${a}  App.zip\n`);
  it('accepts the listed digest, in either case', () => {
    expect(() => checkDigest(sums, 'App.zip', a.toUpperCase())).not.toThrow();
  });
  it('refuses another digest, and a file it does not list', () => {
    expect(() => checkDigest(sums, 'App.zip', 'b'.repeat(64))).toThrow(
      "App.zip doesn't match its checksum in SHA256SUMS",
    );
    expect(() => checkDigest(sums, 'Other.zip', a)).toThrow("SHA256SUMS doesn't list Other.zip");
  });
});

describe('sha256File', () => {
  it('hashes the file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checksum-'));
    const file = path.join(dir, 'f');
    const data = Buffer.alloc(3 * 1024 * 1024, 7);
    fs.writeFileSync(file, data);
    expect(await sha256File(file)).toBe(createHash('sha256').update(data).digest('hex'));
    fs.rmSync(dir, { recursive: true });
  });
});
