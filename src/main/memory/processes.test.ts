import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseProcStatus, parsePs, readProc } from './processes';

// `ps -A -ww -o pid=,ppid=,rss=,args=` as macOS prints it.
const MAC_PS = `    1     0  13456 /sbin/launchd
  501     1 210000 /Applications/App.app/Contents/MacOS/App
  610   501 307200 /Users/me/.local/bin/claude --session-id abc
  611   610   4096 -zsh
  612   611 1258291 node /repo/node_modules/.bin/vite --port 20060
  613   610  81920 node /Users/me/.npm/_npx/tracker-mcp/index.js

garbage line
`;

describe('parsePs (macOS)', () => {
  it('reads pid, parent, resident memory in bytes, name and command line', () => {
    const entries = parsePs(MAC_PS);
    expect(entries).toHaveLength(6);
    expect(entries[2]).toEqual({
      pid: 610,
      ppid: 501,
      rss: 307200 * 1024,
      name: 'claude',
      args: '/Users/me/.local/bin/claude --session-id abc',
    });
    // A login shell's "-zsh" is zsh.
    expect(entries[3]?.name).toBe('zsh');
    expect(entries[4]).toMatchObject({ name: 'node', args: expect.stringContaining('vite') });
  });
});

// /proc/<pid>/status as Linux writes it, trimmed.
const status = (name: string, ppid: number, rssKb: number | null) =>
  `Name:\t${name}\nUmask:\t0022\nState:\tS (sleeping)\nTgid:\t1\nPid:\t1\nPPid:\t${ppid}\n${
    rssKb === null ? '' : `VmRSS:\t   ${rssKb} kB\n`
  }Threads:\t1\n`;

describe('parseProcStatus (Linux)', () => {
  it('reads the name, parent, VmRSS and the NUL-separated command line', () => {
    expect(
      parseProcStatus(700, status('node', 610, 1228800), 'node\0/repo/node_modules/.bin/vite\0'),
    ).toEqual({
      pid: 700,
      ppid: 610,
      rss: 1228800 * 1024,
      name: 'node',
      args: 'node /repo/node_modules/.bin/vite',
    });
  });

  it('counts a kernel thread (no VmRSS) as 0 and refuses a file without PPid', () => {
    expect(parseProcStatus(2, status('kthreadd', 0, null), '')?.rss).toBe(0);
    expect(parseProcStatus(3, 'Name:\tx\n', '')).toBeNull();
  });
});

describe('readProc', () => {
  let root = '';
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('reads every numeric folder and skips one that vanished', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
    const add = (pid: number, text: string, cmdline: string) => {
      fs.mkdirSync(path.join(root, String(pid)));
      fs.writeFileSync(path.join(root, String(pid), 'status'), text);
      fs.writeFileSync(path.join(root, String(pid), 'cmdline'), cmdline);
    };
    add(610, status('claude', 1, 300000), 'claude\0--resume\0x\0');
    add(611, status('bash', 610, 4000), 'bash\0');
    // Gone between listing and reading: no status file.
    fs.mkdirSync(path.join(root, '612'));
    fs.mkdirSync(path.join(root, 'self'));
    const entries = await readProc(root);
    expect(entries.map((e) => [e.pid, e.ppid, e.name]).sort()).toEqual([
      [610, 1, 'claude'],
      [611, 610, 'bash'],
    ]);
  });
});
