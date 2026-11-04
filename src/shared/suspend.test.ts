import { describe, expect, it } from 'vitest';
import type { WorkspaceState } from './status';
import {
  draftAfter,
  type SuspendFacts,
  suspendBlocker,
  suspendDue,
  suspendedNote,
  typesText,
} from './suspend';

const idle: SuspendFacts = {
  delayMin: 10,
  shown: false,
  state: 'done',
  started: true,
  background: 0,
  keepRunning: false,
  draft: false,
  resuming: false,
};

describe('suspendBlocker (spec §9.8)', () => {
  it('allows an idle session that nothing keeps', () => {
    expect(suspendBlocker(idle)).toBeNull();
  });

  it.each<WorkspaceState>(['done', 'needs-input', 'interrupted'])('counts %s as idle', (state) => {
    expect(suspendBlocker({ ...idle, state })).toBeNull();
  });

  it.each<WorkspaceState>(['working', 'needs-permission', 'exited', 'error'])(
    'never suspends while %s',
    (state) => {
      expect(suspendBlocker({ ...idle, state })).toBe('busy');
    },
  );

  it('counts Starting as idle only once SessionStart arrived', () => {
    expect(suspendBlocker({ ...idle, state: 'starting', started: false })).toBe('busy');
    expect(suspendBlocker({ ...idle, state: 'starting', started: true })).toBeNull();
  });

  it('is off without a delay', () => {
    expect(suspendBlocker({ ...idle, delayMin: null })).toBe('off');
  });

  it('never suspends a shown, kept or resuming session', () => {
    expect(suspendBlocker({ ...idle, shown: true })).toBe('shown');
    expect(suspendBlocker({ ...idle, keepRunning: true })).toBe('kept');
    expect(suspendBlocker({ ...idle, resuming: true })).toBe('resuming');
  });

  it('never suspends with background work', () => {
    expect(suspendBlocker({ ...idle, background: 1 })).toBe('background');
    expect(suspendBlocker({ ...idle, state: 'working', background: 2 })).toBe('busy');
  });

  it('keeps a session with an unsent draft', () => {
    expect(suspendBlocker({ ...idle, draft: true })).toBe('draft');
  });
});

describe('suspendDue', () => {
  it('is due once the whole delay has passed', () => {
    expect(suspendDue(0, 299_999, 5)).toBe(false);
    expect(suspendDue(0, 300_000, 5)).toBe(true);
    expect(suspendDue(1000, 1000 + 30 * 100, 30, 100)).toBe(true);
  });
});

describe('typesText', () => {
  it.each([['a'], ['fix the bug'], ['é'], ['\x1b[200~pasted\x1b[201~'], ['1']])(
    'counts %j as typed text',
    (data) => {
      expect(typesText(data)).toBe(true);
    },
  );

  it.each([
    ['\x1b[A'],
    ['\x1b[B'],
    ['\x1bOA'],
    ['\x1b'],
    ['\x03'],
    ['\r'],
    ['\x7f'],
    ['\x1b\r'],
    ['\x1b[Z'],
    ['\x1bb'],
    ['\x1b[200~\x1b[201~'],
  ])('ignores %j', (data) => {
    expect(typesText(data)).toBe(false);
  });
});

describe('suspendedNote', () => {
  it('counts sessions', () => {
    expect(suspendedNote(1)).toBe('1 session suspended');
    expect(suspendedNote(3)).toBe('3 sessions suspended');
  });
});

describe('draftAfter', () => {
  it('starts a draft with typed text and ends it with ↵', () => {
    expect(draftAfter(false, 'f')).toBe(true);
    expect(draftAfter(true, '\x1b[D')).toBe(true);
    expect(draftAfter(true, '\r')).toBe(false);
    // A command such as /model sends no prompt hook, but ↵ sent it.
    expect(draftAfter(false, '/model sonnet\r')).toBe(false);
    expect(draftAfter(false, 'one\rtwo')).toBe(true);
  });

  it('keeps it through ⇧↵ and pasted line breaks', () => {
    expect(draftAfter(true, '\x1b\r')).toBe(true);
    expect(draftAfter(false, '\x1b[200~line one\rline two\x1b[201~')).toBe(true);
    expect(draftAfter(false, '\x1b[200~\x1b[201~')).toBe(false);
  });
});
