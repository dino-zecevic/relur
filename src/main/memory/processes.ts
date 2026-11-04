import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** One process of the machine, as the process table shows it. */
export interface ProcessEntry {
  pid: number;
  ppid: number;
  /** Resident memory in bytes. */
  rss: number;
  /** Executable name without a folder, e.g. "node". */
  name: string;
  /** The command line, for telling a dev server from an MCP server. */
  args: string;
}

/** The executable's name from a command line's first word ("-zsh" counts as "zsh"). */
const nameOf = (command: string) => path.basename(command).replace(/^-/, '');

/**
 * macOS: the output of `ps -A -ww -o pid=,ppid=,rss=,args=` (rss in KiB). The
 * name is the command line's first word, so an executable whose folder has a
 * space shows a shorter name; it is only used for labels.
 */
export function parsePs(output: string): ProcessEntry[] {
  const entries: ProcessEntry[] = [];
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const args = (match[4] ?? '').trim();
    entries.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rss: Number(match[3]) * 1024,
      name: nameOf(args.split(/\s+/)[0] ?? ''),
      args,
    });
  }
  return entries;
}

/**
 * Linux: one process from `/proc/<pid>/status` (Name, PPid, VmRSS in kB) and
 * `/proc/<pid>/cmdline` (NUL-separated). Kernel threads have no VmRSS: 0.
 */
export function parseProcStatus(pid: number, status: string, cmdline: string): ProcessEntry | null {
  const field = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(status)?.[1]?.trim();
  const ppid = Number(field('PPid'));
  if (!Number.isInteger(ppid)) return null;
  const rss = Number(/^(\d+)/.exec(field('VmRSS') ?? '')?.[1] ?? 0) * 1024;
  const args = cmdline.split('\0').filter(Boolean).join(' ');
  return { pid, ppid, rss, name: field('Name') ?? nameOf(args.split(' ')[0] ?? ''), args };
}

function readPs(): Promise<ProcessEntry[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'ps',
      ['-A', '-ww', '-o', 'pid=,ppid=,rss=,args='],
      { maxBuffer: 32 * 1024 * 1024, timeout: 5_000 },
      (error, stdout) => (error ? reject(error) : resolve(parsePs(stdout))),
    );
  });
}

/** Linux: every process from `/proc` (another root in tests). */
export async function readProc(root = '/proc'): Promise<ProcessEntry[]> {
  const pids = (await readdir(root)).filter((n) => /^\d+$/.test(n));
  const entries = await Promise.all(
    pids.map(async (n) => {
      try {
        const [status, cmdline] = await Promise.all([
          readFile(path.join(root, n, 'status'), 'utf8'),
          readFile(path.join(root, n, 'cmdline'), 'utf8').catch(() => ''),
        ]);
        return parseProcStatus(Number(n), status, cmdline);
      } catch {
        // The process ended while being read.
        return null;
      }
    }),
  );
  return entries.filter((e): e is ProcessEntry => e !== null);
}

/** Every process of the machine: `ps` on macOS, `/proc` on Linux, nothing elsewhere. */
export function readProcessTable(platform = process.platform): Promise<ProcessEntry[]> {
  if (platform === 'darwin') return readPs();
  if (platform === 'linux') return readProc();
  return Promise.resolve([]);
}
