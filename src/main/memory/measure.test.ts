import { describe, expect, it } from 'vitest';
import { appMemory, descendants, measureSession, processLabel, processTree } from './measure';
import type { ProcessEntry } from './processes';

const MB = 1024 * 1024;
const p = (pid: number, ppid: number, mb: number, name: string, args = name): ProcessEntry => ({
  pid,
  ppid,
  rss: mb * MB,
  name,
  args,
});

// The app (100), a Claude session (200) with a shell running a dev server, an
// MCP server and a background command; another session (300); unrelated 900.
const TABLE = [
  p(1, 0, 10, 'launchd'),
  p(100, 1, 250, 'App'),
  p(101, 100, 180, 'App Helper (Renderer)'),
  p(200, 100, 300, 'claude', 'claude --session-id a'),
  p(201, 200, 4, 'zsh'),
  p(202, 201, 900, 'node', 'node /repo/node_modules/.bin/next dev --port 20060'),
  p(203, 202, 300, 'node', 'node /repo/node_modules/next/dist/server/worker.js'),
  p(204, 200, 80, 'node', 'node /home/me/.npm/_npx/x/tracker-mcp/index.js'),
  p(205, 200, 6, 'bash', 'bash -c sleep 600'),
  p(206, 205, 1, 'sleep', 'sleep 600'),
  p(300, 100, 200, 'claude'),
  p(900, 1, 4000, 'Browser'),
];

describe('processTree and descendants', () => {
  it('finds every process below one at any depth, not itself or others', () => {
    const tree = processTree(TABLE);
    expect(
      descendants(tree, 200)
        .map((e) => e.pid)
        .sort(),
    ).toEqual([201, 202, 203, 204, 205, 206]);
    expect(descendants(tree, 300)).toEqual([]);
    expect(descendants(tree, 42)).toEqual([]);
  });

  it('survives a loop in the table (a pid reused while it was read)', () => {
    const tree = processTree([p(10, 11, 1, 'a'), p(11, 10, 1, 'b'), p(12, 12, 1, 'self')]);
    expect(descendants(tree, 10).map((e) => e.pid)).toEqual([11]);
    expect(descendants(tree, 12)).toEqual([]);
  });
});

describe('processLabel', () => {
  it.each([
    ['node', 'node /repo/node_modules/.bin/vite', 'node dev server'],
    ['node', 'node /repo/node_modules/.bin/next dev', 'node dev server'],
    ['npm', 'npm run dev', 'npm dev server'],
    ['python3', 'python3 manage.py runserver 0.0.0.0:20060', 'python3 dev server'],
    ['python3', 'python3 -m http.server 20061', 'python3 dev server'],
    ['node', 'node /x/@modelcontextprotocol/server-github/dist/index.js', 'node MCP server'],
    ['uvx', 'uvx mcp-server-fetch', 'uvx MCP server'],
    ['zsh', 'zsh', 'zsh'],
    ['node', 'node build.js --watch', 'node'],
    ['node', 'node /repo/devtools.js', 'node'],
  ])('%s %s → %s', (name, args, label) => {
    expect(processLabel({ name, args })).toBe(label);
  });
});

describe('measureSession', () => {
  it("splits Claude's own process from what it started, by label, largest first", () => {
    expect(measureSession(processTree(TABLE), 200)).toEqual({
      claude: 300 * MB,
      other: (4 + 900 + 300 + 80 + 6 + 1) * MB,
      otherParts: [
        { label: 'node', bytes: 300 * MB },
        { label: 'node dev server', bytes: 900 * MB },
        { label: 'node MCP server', bytes: 80 * MB },
        { label: 'bash', bytes: 6 * MB },
        { label: 'zsh', bytes: 4 * MB },
        { label: 'sleep', bytes: 1 * MB },
      ].sort((a, b) => b.bytes - a.bytes),
    });
  });

  it('is null for a process that is gone', () => {
    expect(measureSession(processTree(TABLE), 4242)).toBeNull();
  });
});

describe('appMemory', () => {
  it("sums the app's processes from the table, with Electron's figure for missing ones", () => {
    const tree = processTree(TABLE);
    expect(
      appMemory(tree, [
        { pid: 100, fallbackBytes: 1 },
        { pid: 101, fallbackBytes: 1 },
        { pid: 150, fallbackBytes: 20 * MB },
      ]),
    ).toBe((250 + 180 + 20) * MB);
  });
});
