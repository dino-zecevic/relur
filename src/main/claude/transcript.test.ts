import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  awaitLastResponse,
  endsWithDeniedPermission,
  isBackgroundHandBack,
  readPrompts,
  readResponses,
  shownPrompt,
  watchTranscript,
} from './transcript';

let file: string;
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-')), 's.jsonl');
});
afterEach(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

const line = (entry: unknown) => JSON.stringify(entry);
const user = (content: unknown, extra = {}) =>
  line({ type: 'user', message: { role: 'user', content }, ...extra });
const assistant = (content: unknown, timestamp: string) =>
  line({ type: 'assistant', message: { role: 'assistant', content }, timestamp });

describe('readResponses', () => {
  it('groups the assistant text after each prompt, without tool calls and results', () => {
    fs.writeFileSync(
      file,
      [
        line({ type: 'summary', summary: 'x' }),
        user('<command-name>/clear</command-name>', { isMeta: true }),
        user('Fix the login bug'),
        assistant(
          [
            { type: 'text', text: 'Looking at it.' },
            { type: 'tool_use', name: 'Bash' },
          ],
          't1',
        ),
        user([{ type: 'tool_result', content: 'ok' }]),
        assistant([{ type: 'text', text: 'Fixed **it**.\n\n```ts\nx\n```' }], 't2'),
        user([{ type: 'text', text: 'Thanks' }]),
        assistant('You are welcome.', 't3'),
        'not json',
        '',
      ].join('\n'),
    );
    expect(readResponses(file)).toEqual([
      {
        text: 'Looking at it.\n\nFixed **it**.\n\n```ts\nx\n```',
        at: 't2',
        prompt: 'Fix the login bug',
        afterBackground: false,
      },
      { text: 'You are welcome.', at: 't3', prompt: 'Thanks', afterBackground: false },
    ]);
  });

  it('gives the turn after background work handing back a response of its own', () => {
    fs.writeFileSync(
      file,
      [
        user('Run the tests in the background'),
        assistant('Started them.', 't1'),
        // A command's notification, by its text; an agent's report, by its origin.
        user('<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>'),
        assistant('The tests passed.', 't2'),
        user([{ type: 'text', text: '<agent-message from="a1">\nReport' }]),
        user('<task-notification>\n<task-id>a2</task-id>', {
          origin: { kind: 'task-notification' },
        }),
        assistant('Both agents are done.', 't3'),
      ].join('\n'),
    );
    expect(readResponses(file)).toEqual([
      {
        text: 'Started them.',
        at: 't1',
        prompt: 'Run the tests in the background',
        afterBackground: false,
      },
      { text: 'The tests passed.', at: 't2', prompt: null, afterBackground: true },
      { text: 'Both agents are done.', at: 't3', prompt: null, afterBackground: true },
    ]);
    expect(isBackgroundHandBack('<agent-message from="a1">')).toBe(true);
    expect(isBackgroundHandBack('Explain <task-notification> to me')).toBe(false);
  });

  it('gives none for a missing file or a prompt without an answer yet', () => {
    expect(readResponses(path.join(path.dirname(file), 'missing.jsonl'))).toEqual([]);
    fs.writeFileSync(file, user('Hello'));
    expect(readResponses(file)).toEqual([]);
  });
});

// As Claude Code 2.1.318 writes a paste in the hook's prompt and the transcript.
const PASTE =
  'Context first: \n\n<pasted_content id="5780">\nReply with one word.\nLine two.\n</pasted_content id="5780">\n';

describe('shownPrompt', () => {
  it("is a prompt as Claude shows it: pasted text without Claude's tags", () => {
    expect(shownPrompt(PASTE)).toBe('Context first: \nReply with one word.\nLine two.');
    expect(
      shownPrompt('\n\n<pasted_content id="1">\nOnly pasted\n</pasted_content id="1">\n'),
    ).toBe('Only pasted');
    expect(shownPrompt('  typed <b>as is</b> ')).toBe('typed <b>as is</b>');
  });
});

describe('readPrompts', () => {
  it('lists the prompts typed or pasted, oldest first, without hand-backs or commands', () => {
    fs.writeFileSync(
      file,
      [
        user('<command-name>/model</command-name>'),
        user('AB-10247 backend: fix the login'),
        assistant('AB-10247 backend: done', 't1'),
        user([{ type: 'tool_result', content: 'ok' }]),
        user('<task-notification><task-id>b1</task-id></task-notification>'),
        user('Caveat', { isMeta: true }),
        user(PASTE),
        user([{ type: 'text', text: 'ok' }]),
        'not json',
      ].join('\n'),
    );
    expect(readPrompts(file)).toEqual([
      'AB-10247 backend: fix the login',
      'Context first: \nReply with one word.\nLine two.',
      'ok',
    ]);
    expect(readPrompts(path.join(path.dirname(file), 'missing.jsonl'))).toEqual([]);
  });
});

describe('endsWithDeniedPermission', () => {
  // As Claude Code 2.1.312 writes a permission prompt answered No.
  const denied = [
    user('Run the link command'),
    assistant([{ type: 'tool_use', name: 'Bash' }], '2026-10-29T10:00:00Z'),
    user(
      [
        {
          type: 'tool_result',
          content: "The user doesn't want to proceed with this tool use.",
          is_error: true,
        },
      ],
      { toolUseResult: 'User rejected tool use' },
    ),
    line({ type: 'attachment' }),
    user([{ type: 'text', text: '[Request interrupted by user for tool use]' }]),
    line({ type: 'system' }),
    line({ type: 'last-prompt' }),
  ];

  it('sees a denied permission at the end of the transcript', () => {
    fs.writeFileSync(file, `${denied.join('\n')}\n`);
    expect(endsWithDeniedPermission(file)).toBe(true);
  });

  it('is false once Claude goes on, or without a denial', () => {
    fs.writeFileSync(
      file,
      [...denied, user('Say ok'), assistant([{ type: 'text', text: 'ok' }], 'x')].join('\n'),
    );
    expect(endsWithDeniedPermission(file)).toBe(false);
    fs.writeFileSync(file, denied.slice(0, 2).join('\n'));
    expect(endsWithDeniedPermission(file)).toBe(false);
    expect(endsWithDeniedPermission(path.join(path.dirname(file), 'missing.jsonl'))).toBe(false);
  });
});

describe('awaitLastResponse', () => {
  it('waits until the last response ends with the Stop hook message, then gives all of it', async () => {
    fs.writeFileSync(
      file,
      `${[
        user('First'),
        assistant('Old answer.', 't0'),
        user('Fix it'),
        assistant(
          [
            { type: 'text', text: 'Looking.' },
            { type: 'tool_use', name: 'Bash' },
          ],
          't1',
        ),
      ].join('\n')}\n`,
    );
    // Claude Code writes the response after running the Stop hook.
    setTimeout(() => fs.appendFileSync(file, `${assistant('Fixed **it**.', 't2')}\n`), 250);
    expect(await awaitLastResponse(file, 'Fixed **it**.\n')).toBe('Looking.\n\nFixed **it**.');
  });

  it('starts the last response after background work handing back', async () => {
    fs.writeFileSync(
      file,
      `${[
        user('Run it in the background'),
        assistant('Started.', 't1'),
        user('<task-notification>\n<task-id>b1</task-id>'),
        assistant('It finished.', 't2'),
      ].join('\n')}\n`,
    );
    expect(await awaitLastResponse(file, 'It finished.')).toBe('It finished.');
  });

  it("gives the hook's message when the transcript doesn't get there, null without text", async () => {
    fs.writeFileSync(file, `${[user('Fix it'), assistant('Partial.', 't1')].join('\n')}\n`);
    expect(await awaitLastResponse(file, 'Done.', 300)).toBe('Done.');
    fs.writeFileSync(file, `${user('Run it')}\n`);
    expect(await awaitLastResponse(file, null, 300)).toBeNull();
    expect(
      await awaitLastResponse(path.join(path.dirname(file), 'none.jsonl'), null, 100),
    ).toBeNull();
  });
});

describe('watchTranscript', () => {
  it('tells when the file grows, appears, or another file takes its place', async () => {
    let current: string | null = null;
    let changes = 0;
    const stop = watchTranscript(
      () => current,
      () => changes++,
      20,
    );
    const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
    await settle();
    expect(changes).toBe(0);
    current = file;
    await settle();
    expect(changes).toBe(1);
    fs.writeFileSync(file, `${user('Fix it')}\n`);
    await settle();
    expect(changes).toBe(2);
    await settle();
    expect(changes).toBe(2);
    const other = path.join(path.dirname(file), 'cleared.jsonl');
    fs.writeFileSync(other, '');
    current = other;
    await settle();
    expect(changes).toBe(3);
    stop();
    fs.appendFileSync(other, `${user('More')}\n`);
    await settle();
    expect(changes).toBe(3);
  });
});
