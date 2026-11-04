import { EventEmitter } from 'node:events';
import type { WorkspaceState } from '@shared/status';
import { DEFAULT_RESUME_PROMPT, type ResumeSettings } from '@shared/unfinished';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStateDb } from '../db/state-db';
import { WorkspaceRecords } from '../db/workspaces';
import { continueOrder, UnfinishedService } from './service';

const workspace = (id: string, profileId = 'work', createdAt = '2026-10-28T10:00:00Z') => ({
  id,
  profileId,
  projectId: 'api',
  name: id,
  task: { id: null, title: id, url: null },
  branch: id,
  baseBranch: 'main',
  worktreePath: `/w/${id}`,
  state: 'starting' as WorkspaceState,
  unread: false,
  stateMessage: null,
  stateSince: null,
  claudeSessionId: null,
  ports: null,
  pr: null,
  createdAt,
  lastActivityAt: null,
});

const TIMING = { settleMs: 10, spacingMs: 1000, readyTimeoutMs: 5000 };

let records: WorkspaceRecords;
let events: EventEmitter;
let sent: { id: string; prompt: string; at: number }[];
let running: Set<string>;
let settings: Record<string, ResumeSettings>;
let limits: Record<string, string>;
let started: string[];

function service() {
  return new UnfinishedService(
    {
      records,
      settings: (p) => settings[p] ?? null,
      profileOrder: () => ['work', 'personal'],
      limit: (p) => limits[p] ?? null,
      claudeRunning: (id) => running.has(id),
      startClaude: async (id) => {
        started.push(id);
        running.add(id);
        events.emit('spawn', id);
      },
      send: (id, prompt) => {
        sent.push({ id, prompt, at: Date.now() });
      },
      onSpawn: (l) => {
        events.on('spawn', l);
        return () => events.off('spawn', l);
      },
      onSessionStart: (l) => {
        events.on('sessionStart', l);
        return () => events.off('sessionStart', l);
      },
    },
    TIMING,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 2, 12) });
  records = new WorkspaceRecords(openStateDb(':memory:'));
  events = new EventEmitter();
  sent = [];
  running = new Set();
  settings = {};
  limits = {};
  started = [];
});

afterEach(() => {
  vi.useRealTimers();
});

/** Inserts workspaces in these states, as the app left them. */
function seed(states: Record<string, WorkspaceState>, profileOf: Record<string, string> = {}) {
  let n = 0;
  for (const [id, state] of Object.entries(states)) {
    records.insert(workspace(id, profileOf[id], `2026-10-28T10:00:0${n++}Z`));
    records.setState(id, state);
  }
}

describe('marking (spec §9.7)', () => {
  it('marks at quit what was working, interrupted or asking for permission', () => {
    seed({
      a: 'working',
      b: 'interrupted',
      c: 'needs-permission',
      d: 'done',
      e: 'needs-input',
      f: 'working',
    });
    // f's Claude wasn't running: not part of the quit.
    service().atQuit(['a', 'b', 'c', 'd', 'e']);
    const kinds = Object.fromEntries(records.list().map((w) => [w.id, w.unfinished?.kind]));
    expect(kinds).toEqual({
      a: 'working',
      b: 'interrupted',
      c: 'permission',
      d: undefined,
      e: undefined,
      f: undefined,
    });
  });

  it('marks Done with background commands running, with how many were stopped', () => {
    seed({ a: 'done', b: 'done' });
    records.setState('a', 'done', { background: 2 });
    service().atQuit(['a', 'b']);
    expect(records.get('a')?.unfinished).toMatchObject({ kind: 'commands', stopped: 2 });
    expect(records.get('b')?.unfinished).toBeNull();
  });

  it('after a crash, counts Done with background commands the same', () => {
    seed({ a: 'done' });
    records.setState('a', 'done', { background: 1 });
    records.markUnfinishedAfterCrash();
    expect(records.get('a')?.unfinished).toMatchObject({ kind: 'commands', stopped: 1 });
  });

  it('after a crash, counts the stored states the same', () => {
    seed({ a: 'working', b: 'done', c: 'interrupted', d: 'exited' });
    records.markUnfinishedAfterCrash();
    records.resetRunningStates();
    const kinds = records.list().map((w) => [w.id, w.unfinished?.kind ?? null, w.state]);
    expect(kinds).toEqual([
      ['a', 'working', 'exited'],
      ['b', null, 'done'],
      ['c', 'interrupted', 'exited'],
      ['d', null, 'exited'],
    ]);
  });

  it('crash detection leaves what the quit marked as it is', () => {
    seed({ a: 'interrupted' });
    service().atQuit(['a']);
    const marked = records.get('a')?.unfinished;
    vi.advanceTimersByTime(60_000);
    records.markUnfinishedAfterCrash();
    expect(records.get('a')?.unfinished).toEqual(marked);
    expect(records.takeNewUnfinished().map((w) => w.id)).toEqual(['a']);
  });

  it('a prompt clears the marker and is the last prompt', () => {
    seed({ a: 'working' });
    service().atQuit(['a']);
    records.promptSent('a', 'Fix the login');
    expect(records.get('a')).toMatchObject({ unfinished: null, lastPrompt: 'Fix the login' });
  });

  it('each start offers only what was marked since the last one', () => {
    seed({ a: 'working' });
    service().atQuit(['a']);
    expect(records.takeNewUnfinished().map((w) => w.id)).toEqual(['a']);
    expect(records.takeNewUnfinished()).toEqual([]);
    expect(records.get('a')?.unfinished?.kind).toBe('working');
  });
});

describe('order', () => {
  it('goes by profile tab order, then oldest first', () => {
    const list = [
      { id: 'p1', profileId: 'personal', createdAt: '2026-01-01' },
      { id: 'w2', profileId: 'work', createdAt: '2026-01-03' },
      { id: 'w1', profileId: 'work', createdAt: '2026-01-02' },
      { id: 'x', profileId: 'gone', createdAt: '2025-01-01' },
    ];
    expect(continueOrder(list, ['work', 'personal']).map((w) => w.id)).toEqual([
      'w1',
      'w2',
      'p1',
      'x',
    ]);
  });
});

describe('at start (spec §9.7)', () => {
  it('continues Working ones of profiles that say so, once resumed, a few seconds apart', async () => {
    seed(
      { a: 'working', b: 'working', c: 'interrupted', d: 'needs-permission', e: 'working' },
      { e: 'personal' },
    );
    settings = { work: { continueAtStart: true, prompt: null } };
    const svc = service();
    svc.atQuit(['a', 'b', 'c', 'd', 'e']);
    // Claude resumes in all of them (spec §9.4).
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      running.add(id);
      events.emit('spawn', id);
    }
    const launch = svc.atLaunch(Promise.resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(svc.state().run.items.map((i) => i.workspaceId)).toEqual(['a', 'b']);
    // Nothing goes out before SessionStart.
    await vi.advanceTimersByTimeAsync(100);
    expect(sent).toEqual([]);
    const t0 = Date.now();
    for (const id of ['a', 'b', 'c', 'd', 'e']) events.emit('sessionStart', id);
    await vi.advanceTimersByTimeAsync(TIMING.settleMs);
    expect(sent.map((s) => s.id)).toEqual(['a']);
    expect(sent[0]?.prompt).toBe(DEFAULT_RESUME_PROMPT);
    await vi.advanceTimersByTimeAsync(TIMING.spacingMs);
    expect(sent.map((s) => s.id)).toEqual(['a', 'b']);
    expect((sent[1]?.at ?? 0) - (sent[0]?.at ?? 0)).toBe(TIMING.spacingMs);
    expect(sent[0]?.at).toBe(t0 + TIMING.settleMs);
    await launch;
    // The rest is asked about; the profile without the setting too.
    expect(svc.state().overview).toEqual(['c', 'd', 'e']);
    expect(records.get('a')?.unfinished).toBeNull();
    expect(records.get('c')?.unfinished?.kind).toBe('interrupted');
    expect(svc.state().run.running).toBe(false);
    // Once only.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toHaveLength(2);
  });

  it('never continues stopped commands at start, even with the setting on', async () => {
    seed({ a: 'done', b: 'working' });
    records.setState('a', 'done', { background: 1 });
    running = new Set(['a', 'b']);
    settings = { work: { continueAtStart: true } };
    const svc = service();
    svc.atQuit(['a', 'b']);
    await svc.atLaunch(Promise.resolve());
    expect(sent.map((s) => s.id)).toEqual(['b']);
    expect(svc.state().overview).toEqual(['a']);
    // Chosen in the overview, it gets the continue prompt.
    svc.continue(['a']);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('sends nothing at start with the setting off; asks instead', async () => {
    seed({ a: 'working' });
    const svc = service();
    svc.atQuit(['a']);
    await svc.atLaunch(Promise.resolve());
    expect(sent).toEqual([]);
    expect(svc.state().overview).toEqual(['a']);
    svc.closeOverview();
    expect(svc.state().overview).toBeNull();
    expect(records.get('a')?.unfinished?.kind).toBe('working');
  });

  it('never sends while plan usage is at its limit', async () => {
    seed({ a: 'working', b: 'working' });
    settings = { work: { continueAtStart: true, prompt: 'Go on.' } };
    limits = { work: 'Plan usage is at its session limit' };
    const svc = service();
    svc.atQuit(['a', 'b']);
    await svc.atLaunch(Promise.resolve());
    // Held back for the overview, where Continue selected says why it's disabled.
    expect(svc.state().overview).toEqual(['a', 'b']);
    svc.continue(['a']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([]);
    expect(svc.state().run.items).toEqual([
      { workspaceId: 'a', state: 'held', reason: 'Plan usage is at its session limit' },
    ]);
  });

  it('holds the rest when the limit is reached between two prompts', async () => {
    seed({ a: 'working', b: 'working' });
    running = new Set(['a', 'b']);
    const svc = service();
    svc.atQuit(['a', 'b']);
    svc.continue(['a', 'b']);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.id)).toEqual(['a']);
    limits = { work: 'Plan usage is at its week limit' };
    await vi.advanceTimersByTimeAsync(TIMING.spacingMs);
    expect(sent.map((s) => s.id)).toEqual(['a']);
    expect(svc.state().run.items[1]).toMatchObject({ workspaceId: 'b', state: 'held' });
    expect(records.get('b')?.unfinished?.kind).toBe('working');
  });

  it('Stop cancels the ones not yet sent; they stay unfinished', async () => {
    seed({ a: 'working', b: 'working', c: 'working' });
    running = new Set(['a', 'b', 'c']);
    settings = { work: { continueAtStart: true } };
    const svc = service();
    svc.atQuit(['a', 'b', 'c']);
    void svc.atLaunch(Promise.resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.id)).toEqual(['a']);
    svc.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent.map((s) => s.id)).toEqual(['a']);
    expect(svc.state().run.items.map((i) => i.state)).toEqual(['sent', 'stopped', 'stopped']);
    expect(svc.state().run.running).toBe(false);
    expect(records.get('b')?.unfinished?.kind).toBe('working');
  });

  it('starts a Claude that is not running, and skips one whose marker went away', async () => {
    seed({ a: 'interrupted', b: 'working', c: 'needs-permission' });
    running = new Set(['b']);
    const svc = service();
    svc.atQuit(['a', 'b', 'c']);
    records.promptSent('b', 'typed by hand');
    svc.continue(['a', 'b', 'c']);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['a']);
    events.emit('sessionStart', 'a');
    await vi.advanceTimersByTimeAsync(TIMING.settleMs);
    expect(sent.map((s) => s.id)).toEqual(['a']);
    expect(svc.state().run.items.map((i) => i.state)).toEqual(['sent', 'skipped', 'skipped']);
  });

  it('dismiss clears the marker without sending', () => {
    seed({ a: 'working' });
    const svc = service();
    svc.atQuit(['a']);
    svc.dismiss('a');
    expect(records.get('a')?.unfinished).toBeNull();
    expect(sent).toEqual([]);
  });
});
