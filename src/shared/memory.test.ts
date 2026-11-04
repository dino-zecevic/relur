import { describe, expect, it } from 'vitest';
import {
  describeSplit,
  formatBytes,
  formatTotal,
  type MemorySnapshot,
  memoryGroups,
  memoryShare,
  memoryUsed,
  projectMemory,
  type SessionMemory,
  sessionsTotal,
  workspaceMemory,
} from './memory';

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe('formatBytes', () => {
  it.each([
    [0, '0 MB'],
    [100 * 1024, '1 MB'],
    [340 * MB, '340 MB'],
    [999 * MB, '999 MB'],
    [999.6 * MB, '1.0 GB'],
    [1.2 * GB, '1.2 GB'],
    [1.25 * GB, '1.3 GB'],
    [12.4 * GB, '12.4 GB'],
    [150 * GB, '150 GB'],
  ])('%d → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

const session = (
  sessionId: string,
  workspaceId: string | null,
  label: string,
  claudeMb: number,
  parts: [string, number][] = [],
  projectId = 'api',
): SessionMemory => ({
  sessionId,
  profileId: 'work',
  projectId,
  workspaceId,
  label,
  claude: claudeMb * MB,
  other: parts.reduce((sum, [, mb]) => sum + mb * MB, 0),
  otherParts: parts.map(([l, mb]) => ({ label: l, bytes: mb * MB })),
});

const SNAPSHOT: MemorySnapshot = {
  at: 0,
  app: 700 * MB,
  total: 16 * GB,
  sessions: [
    session('a', 'w1', 'ABC-142', 300, [['node dev server', 1200]]),
    // A workspace with two sessions: summed, labels merged.
    session('b', 'w2', 'ABC-7', 200, [['zsh', 10]]),
    session('c', 'w2', 'ABC-7', 250, [
      ['zsh', 6],
      ['node MCP server', 90],
    ]),
    session('d', null, 'web (main checkout)', 280, [], 'web'),
  ],
};

describe('sums', () => {
  it('groups by workspace, largest first; main-checkout sessions on their own', () => {
    const groups = memoryGroups(SNAPSHOT.sessions);
    expect(groups.map((g) => [g.label, g.total / MB])).toEqual([
      ['ABC-142', 1500],
      ['ABC-7', 556],
      ['web (main checkout)', 280],
    ]);
    expect(groups[1]?.otherParts).toEqual([
      { label: 'node MCP server', bytes: 90 * MB },
      { label: 'zsh', bytes: 16 * MB },
    ]);
  });

  it('per workspace, per project and in all', () => {
    expect(workspaceMemory(SNAPSHOT, 'w2')?.total).toBe(556 * MB);
    expect(workspaceMemory(SNAPSHOT, 'w9')).toBeNull();
    expect(workspaceMemory(null, 'w1')).toBeNull();
    expect(projectMemory(SNAPSHOT, 'api')).toEqual({ bytes: 2056 * MB, sessions: 3 });
    expect(projectMemory(SNAPSHOT, 'web')).toEqual({ bytes: 280 * MB, sessions: 1 });
    expect(projectMemory(SNAPSHOT, 'none')).toBeNull();
    expect(sessionsTotal(SNAPSHOT)).toBe(2336 * MB);
  });
});

describe('describeSplit', () => {
  it('splits a workspace into Claude and what it started', () => {
    expect(describeSplit(memoryGroups(SNAPSHOT.sessions)[0] as never)).toBe(
      'Claude 300 MB, other 1.2 GB: node dev server',
    );
  });
});

describe("the status bar's bar", () => {
  const at = (app: number, total: number): MemorySnapshot => ({ ...SNAPSHOT, app, total });

  it("fills with the sessions and the app, relative to the machine's RAM", () => {
    // 2336 MB of sessions and 736 MB of the app: 3 GB of 16 GB.
    const snapshot = at(736 * MB, 16 * GB);
    expect(memoryUsed(snapshot)).toBe(3 * GB);
    expect(memoryShare(snapshot)).toBeCloseTo(3 / 16);
    expect(memoryShare({ ...snapshot, sessions: [] })).toBeCloseTo(736 / (16 * 1024));
  });

  it('stays between empty and full', () => {
    expect(memoryShare(at(0, 2 * GB))).toBe(1);
    expect(memoryShare(at(0, 0))).toBe(0);
    expect(memoryShare({ at: 0, app: 0, total: 8 * GB, sessions: [] })).toBe(0);
  });

  it("shows the machine's RAM in whole gigabytes", () => {
    expect(formatTotal(16 * GB)).toBe('16 GB');
    expect(formatTotal(15.6 * GB)).toBe('16 GB');
    expect(formatTotal(7.8 * GB)).toBe('8 GB');
    expect(formatTotal(512 * MB)).toBe('512 MB');
  });
});
