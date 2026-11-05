import type { SessionInfo } from '@shared/terminal-protocol';
import { describe, expect, it, vi } from 'vitest';
import { parseFixedMemory } from './fixed';
import { MemoryMonitor } from './service';

const MB = 1024 * 1024;
const info = (id: string, workspaceId: string): SessionInfo => ({
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

describe('TEST_MEMORY', () => {
  it('parses MB into bytes, parts largest first', () => {
    const fixed = parseFixedMemory(
      JSON.stringify({
        total: 16384,
        app: 460,
        sessions: {
          'ABC-142': { claude: 330, other: { 'node MCP server': 60, 'node dev server': 1130 } },
        },
      }),
    );
    expect(fixed?.total).toBe(16384 * MB);
    expect(fixed?.app).toBe(460 * MB);
    expect(fixed?.sessions['ABC-142']).toEqual({
      claude: 330 * MB,
      other: 1190 * MB,
      otherParts: [
        { label: 'node dev server', bytes: 1130 * MB },
        { label: 'node MCP server', bytes: 60 * MB },
      ],
    });
  });

  it('is null when unset or invalid', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseFixedMemory(undefined)).toBeNull();
    expect(parseFixedMemory('{')).toBeNull();
    expect(parseFixedMemory('{"total":-1,"app":0,"sessions":{}}')).toBeNull();
    error.mockRestore();
  });

  it('replaces measuring: listed sessions only, the process table is never read', async () => {
    const readProcesses = vi.fn(async () => []);
    const m = new MemoryMonitor({
      sessions: () => [
        { info: info('s1', 'w1'), pid: 20 },
        { info: info('s2', 'w2'), pid: 30 },
      ],
      label: (i) => (i.workspaceId === 'w1' ? 'ABC-142' : 'ABC-147'),
      readProcesses,
      appProcesses: () => [],
      visible: () => true,
      fixed: parseFixedMemory('{"total":16384,"app":460,"sessions":{"ABC-142":{"claude":330}}}'),
    });
    await m.refresh();
    expect(readProcesses).not.toHaveBeenCalled();
    const snapshot = m.current();
    expect(snapshot?.total).toBe(16384 * MB);
    expect(snapshot?.app).toBe(460 * MB);
    expect(snapshot?.sessions.map((s) => [s.label, s.claude, s.other])).toEqual([
      ['ABC-142', 330 * MB, 0],
    ]);
  });
});
