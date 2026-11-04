import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppLog, PhaseTimer } from './app-log';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-log-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const lines = (file: string) =>
  fs
    .readFileSync(file, 'utf8')
    .trimEnd()
    .split('\n')
    .map((l) => l.replace(/^\S+ /, '').replace(/\d+ ms/g, 'N ms'));

describe('AppLog', () => {
  it('times phases, marks a failed one and adds the total', async () => {
    const log = new AppLog(path.join(root, 'app.log'));
    const timer = log.timer('create x in p');
    expect(await timer.time('git fetch', async () => 42)).toBe(42);
    await expect(
      timer.time('git worktree add', () => Promise.reject(new Error('no'))),
    ).rejects.toThrow('no');
    timer.since('ports', performance.now());
    timer.total();
    expect(lines(log.file)).toEqual([
      'create x in p: git fetch N ms',
      'create x in p: git worktree add N ms (failed)',
      'create x in p: ports N ms',
      'create x in p: total N ms',
    ]);
  });

  it('moves a log over 1 MB aside at start, and never throws', () => {
    const file = path.join(root, 'app.log');
    fs.writeFileSync(file, 'x'.repeat(1024 * 1024 + 1));
    const log = new AppLog(file);
    expect(fs.statSync(path.join(root, 'app.old.log')).size).toBe(1024 * 1024 + 1);
    log.write('next');
    expect(lines(file)).toEqual(['next']);
    // A folder in its place: nothing is written, nothing thrown.
    const blocked = new AppLog(root);
    expect(() => blocked.write('lost')).not.toThrow();
  });

  it('writes nothing without a log', async () => {
    expect(await new PhaseTimer(null, 's').time('p', () => 1)).toBe(1);
  });
});
