import type { SessionInfo } from '@shared/terminal-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessEntry } from './processes';
import { MemoryMonitor } from './service';

const MB = 1024 * 1024;
const info = (id: string, workspaceId: string | null): SessionInfo => ({
  id,
  kind: 'claude',
  title: 'Claude',
  cwd: '/w',
  profileId: 'work',
  projectId: 'api',
  workspaceId,
  status: 'running',
  exitCode: null,
  signal: null,
  launching: false,
  resuming: false,
  generation: 0,
  note: null,
});
const TABLE: ProcessEntry[] = [
  { pid: 10, ppid: 1, rss: 100 * MB, name: 'App', args: 'App' },
  { pid: 20, ppid: 10, rss: 300 * MB, name: 'claude', args: 'claude' },
  { pid: 21, ppid: 20, rss: 50 * MB, name: 'zsh', args: 'zsh' },
];

function monitor(visible: () => boolean) {
  let sessions = [{ info: info('s1', 'w1'), pid: 20 }];
  const readProcesses = vi.fn(async () => TABLE);
  const m = new MemoryMonitor({
    sessions: () => sessions,
    label: (i) => (i.workspaceId === 'w1' ? 'ABC-142' : i.title),
    readProcesses,
    appProcesses: () => [{ pid: 10, fallbackBytes: 0 }],
    visible,
    totalMemory: () => 16 * 1024 * MB,
    intervalMs: 10_000,
  });
  return { m, readProcesses, endSessions: () => (sessions = []) };
}

describe('MemoryMonitor', () => {
  afterEach(() => vi.useRealTimers());

  it('measures every interval only while the window is visible', async () => {
    vi.useFakeTimers();
    let visible = false;
    const { m, readProcesses } = monitor(() => visible);
    m.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readProcesses).not.toHaveBeenCalled();
    expect(m.current()).toBeNull();
    visible = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(readProcesses).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(readProcesses).toHaveBeenCalledTimes(3);
    m.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(readProcesses).toHaveBeenCalledTimes(3);
  });

  it('builds the snapshot, tells listeners, and drops ended sessions', async () => {
    const { m, endSessions } = monitor(() => true);
    const changed = vi.fn();
    m.onChange(changed);
    await m.refresh();
    expect(m.current()).toMatchObject({
      app: 100 * MB,
      total: 16 * 1024 * MB,
      sessions: [
        {
          sessionId: 's1',
          workspaceId: 'w1',
          projectId: 'api',
          label: 'ABC-142',
          claude: 300 * MB,
          other: 50 * MB,
          otherParts: [{ label: 'zsh', bytes: 50 * MB }],
        },
      ],
    });
    endSessions();
    m.sessionsChanged();
    expect(m.current()?.sessions).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('shares a measurement under way and keeps the last snapshot when ps fails', async () => {
    const { m, readProcesses } = monitor(() => true);
    await Promise.all([m.refresh(), m.refresh()]);
    expect(readProcesses).toHaveBeenCalledTimes(1);
    const before = m.current();
    readProcesses.mockRejectedValueOnce(new Error('ps: not found'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await m.refresh();
    expect(m.current()).toBe(before);
  });
});
