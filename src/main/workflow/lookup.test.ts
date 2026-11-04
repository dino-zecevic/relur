import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppLog } from '../app-log';
import { type LookupContext, TaskLookupService } from './lookup';

let root: string;
let service: TaskLookupService;
let log: AppLog;

const script = (name: string, body: string) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lookup-'));
  const context: LookupContext = {
    shell: '/bin/sh',
    env: { PATH: `${root}:${process.env.PATH}`, HOME: root },
    cwd: root,
    // A stand-in for Claude: answers with the JSON of `claude -p --output-format json`.
    claudeCommand: script(
      'claude',
      `case "$2" in
  *FAKE-1*) echo '{"type":"result","is_error":false,"duration_ms":812,"duration_api_ms":640,"num_turns":3,"result":"","structured_output":{"title":"Fix the login","missingTool":null},"permission_denials":[]}' ;;
  *FAKE-2*) echo '{"type":"result","is_error":false,"result":"NO","permission_denials":[{"tool_name":"mcp__tracker__get_issue"}]}' ;;
  *) exit 1 ;;
esac`,
    ),
    pluginDirs: [],
  };
  log = new AppLog(path.join(root, 'logs', 'app.log'));
  service = new TaskLookupService(async () => context, log);
});

afterEach(() => {
  service.dispose();
  fs.rmSync(root, { recursive: true, force: true });
});

const run = (taskId: string, lookup: Parameters<TaskLookupService['run']>[0]['lookup']) =>
  service.run({ requestId: taskId, profileId: 'p', projectId: null, taskId, lookup });
const prompt = {
  kind: 'prompt' as const,
  prompt: 'Title of {id}',
  model: 'haiku',
  tools: [],
  timeoutSec: 10,
};

describe('TaskLookupService', () => {
  it('runs a command with the id quoted, and reads its first line', async () => {
    script(
      'tracker',
      `[ "$1" = "FAKE-1" ] && echo "FAKE-1: Fix the login" || { echo "no such task" >&2; exit 2; }`,
    );
    expect(
      await run('FAKE-1', { kind: 'command', command: 'tracker {id}', timeoutSec: 10 }),
    ).toEqual({ ok: true, title: 'Fix the login' });
    expect(
      await run('FAKE-9', { kind: 'command', command: 'tracker {id}', timeoutSec: 10 }),
    ).toEqual({ ok: false, message: 'The lookup failed (exit 2): no such task', refused: [] });
    expect(await run('FAKE-1', { kind: 'command', command: 'true', timeoutSec: 10 })).toMatchObject(
      { message: 'The lookup printed nothing', notFound: true },
    );
  });

  it('stops a lookup after its timeout and on Cancel', async () => {
    const slow = { kind: 'command' as const, command: 'sleep 30', timeoutSec: 5 };
    const started = Date.now();
    const cancelled = run('FAKE-1', slow);
    setTimeout(() => service.cancel('FAKE-1'), 200);
    expect(await cancelled).toMatchObject({ ok: false, message: 'Cancelled' });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(
      await service.run({
        requestId: 'r',
        profileId: 'p',
        projectId: null,
        taskId: 'FAKE-1',
        lookup: { ...slow, timeoutSec: 5, command: 'sleep 30' },
      }),
    ).toMatchObject({ message: 'The lookup timed out after 5 s' });
  }, 15_000);

  it("asks Claude, and names the tool it wasn't allowed", async () => {
    expect(await run('FAKE-1', prompt)).toEqual({ ok: true, title: 'Fix the login' });
    expect(await run('FAKE-2', prompt)).toMatchObject({
      ok: false,
      refused: ['mcp__tracker__get_issue'],
    });
    expect(await run('FAKE-3', prompt)).toMatchObject({ ok: false, message: /exit 1/ });
  });

  it("remembers New workspace's found titles per profile and id, until forgotten", async () => {
    const counter = path.join(root, 'count');
    script('tracker', `echo x >> "${counter}"; [ "$1" = "FAKE-1" ] && echo "Fix the login"`);
    const tracker = { kind: 'command' as const, command: 'tracker {id}', timeoutSec: 10 };
    const ask = (taskId: string, profileId = 'p', remember = true) =>
      service.run({
        requestId: taskId,
        profileId,
        projectId: null,
        taskId,
        lookup: tracker,
        remember,
      });
    const count = () => fs.readFileSync(counter, 'utf8').trim().split('\n').length;
    expect(await ask('FAKE-1')).toEqual({ ok: true, title: 'Fix the login' });
    expect(await ask('FAKE-1')).toEqual({ ok: true, title: 'Fix the login' });
    expect(count()).toBe(1);
    // Not for another profile, Test (without remember), or what wasn't found.
    await ask('FAKE-1', 'q');
    await ask('FAKE-1', 'p', false);
    await ask('FAKE-9');
    await ask('FAKE-9');
    expect(count()).toBe(5);
    service.forget('p');
    await ask('FAKE-1');
    expect(count()).toBe(6);
    expect(fs.readFileSync(log.file, 'utf8')).toMatch(/: remembered$/m);
  });

  it('keeps a Cancel that comes before the process runs', async () => {
    let release: () => void = () => {};
    const slowContext = new TaskLookupService(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { shell: '/bin/sh', env: {}, cwd: root, claudeCommand: null, pluginDirs: [] };
    });
    const started = Date.now();
    const pending = slowContext.run({
      requestId: 'early',
      profileId: 'p',
      projectId: null,
      taskId: 'FAKE-1',
      lookup: { kind: 'command', command: 'sleep 30', timeoutSec: 60 },
    });
    slowContext.cancel('early');
    release();
    expect(await pending).toMatchObject({ ok: false, message: 'Cancelled' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("logs each phase, Claude's own times and the outcome (spec §3.4)", async () => {
    await run('FAKE-1', prompt);
    await run('FAKE-9', { kind: 'command', command: 'true', timeoutSec: 10 });
    const lines = fs.readFileSync(log.file, 'utf8').trimEnd().split('\n');
    const text = lines.map((l) => l.replace(/^\S+ /, '').replace(/\d+ ms/g, 'N ms'));
    expect(text).toEqual([
      'lookup FAKE-1 (p): environment N ms',
      'lookup FAKE-1 (p): claude -p N ms',
      'lookup FAKE-1 (p): claude reports N ms, API N ms, 3 turns',
      'lookup FAKE-1 (p): found',
      'lookup FAKE-1 (p): total N ms',
      'lookup FAKE-9 (p): environment N ms',
      'lookup FAKE-9 (p): command N ms',
      'lookup FAKE-9 (p): not found: The lookup printed nothing',
      'lookup FAKE-9 (p): total N ms',
    ]);
    expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT\S+Z /);
  });
});
