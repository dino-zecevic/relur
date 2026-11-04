import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envVar } from '../shared/brand';
import { runHook } from './hook';
import { runLink, runProjects } from './link';
import { runStatusLine } from './statusline';

let server: http.Server;
let received: { url: string; auth: string | undefined; body: unknown }[];
let env: NodeJS.ProcessEnv;
/** What the fake bridge answers. */
let reply: string;

beforeEach(async () => {
  received = [];
  reply = '{}';
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      received.push({
        url: req.url ?? '',
        auth: req.headers.authorization,
        body: JSON.parse(body),
      });
      res.end(reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  env = {
    [envVar('BRIDGE_URL')]: `http://127.0.0.1:${port}`,
    [envVar('BRIDGE_TOKEN')]: 'secret',
    [envVar('WORKSPACE_ID')]: 'ws_1',
    [envVar('PROFILE')]: 'work',
  };
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

describe('helper hook', () => {
  it('forwards the payload tagged with workspace, profile, session and event', async () => {
    expect(await runHook('Stop', '{"session_id":"abc"}', env)).toBe(0);
    // A main checkout's Claude has no workspace, only its terminal session (spec §9.8).
    expect(
      await runHook('Stop', '{}', {
        ...env,
        [envVar('WORKSPACE_ID')]: undefined,
        [envVar('TERMINAL_SESSION')]: 'term-1',
      }),
    ).toBe(0);
    expect(received).toEqual([
      {
        url: '/hook',
        auth: 'Bearer secret',
        body: {
          event: 'Stop',
          workspaceId: 'ws_1',
          profileId: 'work',
          sessionId: null,
          payload: { session_id: 'abc' },
        },
      },
      {
        url: '/hook',
        auth: 'Bearer secret',
        body: {
          event: 'Stop',
          workspaceId: null,
          profileId: 'work',
          sessionId: 'term-1',
          payload: {},
        },
      },
    ]);
  });

  it('exits 0 without a bridge, with bad input, or when the bridge is gone', async () => {
    expect(await runHook('Stop', '{}', {})).toBe(0);
    expect(await runHook('Stop', 'not json', env)).toBe(0);
    expect(received[0]?.body).toMatchObject({ payload: null });
    const gone = { ...env, [envVar('BRIDGE_URL')]: 'http://127.0.0.1:9' };
    expect(await runHook('Stop', '{}', gone)).toBe(0);
  });
});

describe('helper hook at SessionStart (spec §21.9)', () => {
  it("prints the app's note as additional context, and nothing for other events", async () => {
    reply = JSON.stringify({ additionalContext: 'a note for Claude' });
    let out = '';
    const write = (t: string) => {
      out += t;
    };
    await runHook('Stop', '{}', env, write);
    expect(out).toBe('');
    await runHook('SessionStart', '{}', env, write);
    expect(JSON.parse(out)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'a note for Claude',
      },
    });
    out = '';
    reply = '{}';
    await runHook('SessionStart', '{}', env, write);
    expect(out).toBe('');
  });
});

describe('helper link and projects (spec §21.9)', () => {
  let out: string;
  let err: string;
  const io = {
    out: (t: string) => {
      out += t;
    },
    err: (t: string) => {
      err += t;
    },
  };
  beforeEach(() => {
    out = '';
    err = '';
  });

  it('sends the project with the workspace and prints the new worktree path', async () => {
    reply = JSON.stringify({
      ok: true,
      name: 'web',
      projectId: 'web',
      added: true,
      worktreePath: '/w/web/feat',
      branch: 'feat',
      baseBranch: 'main',
      setup: true,
      setupError: null,
    });
    expect(await runLink(['../web'], { ...env, CLAUDECODE: '1' }, '/r/api', io)).toBe(0);
    expect(received[0]).toMatchObject({
      url: '/link',
      body: {
        project: '../web',
        cwd: '/r/api',
        workspaceId: 'ws_1',
        profileId: 'work',
        byClaude: true,
      },
    });
    expect(out).toContain('Added web as a project');
    expect(out).toContain('Linked web: /w/web/feat\n');
    expect(out).toContain('Its setup passed (the Setup · web tab in the app).');
  });

  it("says when the setup failed, with exit 1: it's linked, but not ready", async () => {
    reply = JSON.stringify({
      ok: true,
      name: 'web',
      projectId: 'web',
      added: false,
      worktreePath: '/w/web/feat',
      branch: 'feat',
      baseBranch: 'main',
      setup: true,
      setupError: 'exit 3',
    });
    expect(await runLink(['web'], env, '/r/api', io)).toBe(1);
    expect(out).toContain('Linked web: /w/web/feat\n');
    expect(err).toContain('Its setup failed (exit 3): see the Setup · web tab');
  });

  it('prints why it was refused, with exit 1; checks its arguments', async () => {
    reply = JSON.stringify({ ok: false, error: 'This only works inside a workspace' });
    expect(await runLink(['web'], env, '/', io)).toBe(1);
    expect(err).toBe('This only works inside a workspace\n');
    expect(await runLink([], env, '/', io)).toBe(1);
    expect(await runLink(['a', 'b'], env, '/', io)).toBe(1);
    expect(await runLink(['web'], {}, '/', io)).toBe(2);
  });

  it("lists the profile's projects with their part in this workspace", async () => {
    reply = JSON.stringify({
      ok: true,
      projects: [
        { id: 'api', name: 'api', repoPath: '/r/api', inWorkspace: 'main' },
        { id: 'web', name: 'web-app', repoPath: '/r/web', inWorkspace: 'no' },
      ],
    });
    expect(await runProjects([], env, io)).toBe(0);
    expect(out).toBe('api      /r/api  (main repository of this workspace)\nweb-app  /r/web\n');
    expect(received[0]?.body).toEqual({ workspaceId: 'ws_1', profileId: 'work' });
    expect(await runProjects(['--profile', 'home'], env, io)).toBe(1);
  });
});

describe('helper statusline', () => {
  it("forwards rate_limits and prints the profile's own status line", async () => {
    let out = '';
    const input = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 12 } },
      model: { id: 'claude-haiku-5-5', display_name: 'Haiku' },
    });
    await runStatusLine(
      input,
      { ...env, [envVar('STATUSLINE_COMMAND')]: 'printf "own:%s" "$(cat | head -c 1)"' },
      (text) => {
        out += text;
      },
    );
    expect(out).toBe('own:{');
    expect(received).toEqual([
      {
        url: '/statusline',
        auth: 'Bearer secret',
        body: {
          profileId: 'work',
          workspaceId: 'ws_1',
          sessionId: null,
          rateLimits: { five_hour: { used_percentage: 12 } },
          // Kept so a resume gets the same model (spec §9.8).
          model: 'claude-haiku-5-5',
        },
      },
    ]);
  });

  it('prints nothing without its own command', async () => {
    let out = 'x';
    await runStatusLine('{}', env, (text) => {
      out = text;
    });
    expect(out).toBe('');
  });
});
