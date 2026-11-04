import { describe, expect, it } from 'vitest';
import {
  describeGroup,
  formatBytes,
  type MemorySnapshot,
  memoryGroups,
  memoryTooltip,
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

describe('tooltip text', () => {
  it('describes a workspace with Claude and what it started', () => {
    expect(describeGroup(memoryGroups(SNAPSHOT.sessions)[0] as never)).toBe(
      'ABC-142  1.5 GB (Claude 300 MB, other 1.2 GB: node dev server)',
    );
  });

  it('lists the five largest and the app', () => {
    const many: MemorySnapshot = {
      at: 0,
      app: 700 * MB,
      sessions: [1, 2, 3, 4, 5, 6, 7].map((n) => session(`s${n}`, `w${n}`, `T-${n}`, n * 100)),
    };
    expect(memoryTooltip(many)).toBe(
      [
        'Claude sessions and what they started: 2.7 GB',
        'T-7  700 MB (Claude 700 MB, other 0 MB)',
        'T-6  600 MB (Claude 600 MB, other 0 MB)',
        'T-5  500 MB (Claude 500 MB, other 0 MB)',
        'T-4  400 MB (Claude 400 MB, other 0 MB)',
        'T-3  300 MB (Claude 300 MB, other 0 MB)',
        'and 2 more',
        '',
        'This app: 700 MB',
      ].join('\n'),
    );
    expect(memoryTooltip({ at: 0, app: 500 * MB, sessions: [] })).toBe(
      'No Claude session is running.\n\nThis app: 500 MB',
    );
  });
});
