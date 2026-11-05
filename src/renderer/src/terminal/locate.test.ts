import { describe, expect, it } from 'vitest';
import { keysOf, LineText, letters } from './locate';

// Lines as the real Claude Code (classic renderer) printed them in the live check.
const SCREEN = [
  '❯ Reply with exactly these three lines and nothing else: ALPHA-1 /',
  '  alpha middle / alpha end',
  '',
  '⏺ ALPHA-1 / alpha middle / alpha end',
  '',
  '✻ Sautéed for 2s · done 9:28 AM',
  '',
  '❯ Reply with a numbered list of four items, each one word for a color, then the line CHARLIE-3 end',
  '',
  '⏺ 1. Red',
  '  2. Blue',
  '  3. **Green**',
  '  4. Yellow',
  '',
  '  CHARLIE-3 end',
  '',
  '✻ Baked for 1s · done 9:28 AM',
  '',
  '────────────',
  '❯',
  '────────────',
];

describe('locate', () => {
  it('compares letters and digits only, links by their text', () => {
    expect(letters('**one** `two` [three](https://x.example/y) — 4.')).toBe('onetwothree4');
    expect(letters('Run:\n\n```bash\necho hi\n```')).toBe('Runechohi');
    expect(keysOf({ text: 'ok', at: 'end' })).toEqual([]);
    expect(keysOf({ text: `${'a'.repeat(50)}\nlast line END`, at: 'end' })).toEqual([
      `${'a'.repeat(29)}lastlineEND`,
      `aaaaalastlineEND`,
      'lastlineEND',
    ]);
  });

  it("finds a response's last line above the cursor, across Markdown and wrapping", () => {
    const text = new LineText(SCREEN);
    const cursor = text.endOf(19);
    expect(
      text.findBefore(
        { text: '1. Red\n2. Blue\n3. Green\n4. Yellow\n\nCHARLIE-3 end', at: 'end' },
        cursor,
      )?.line,
    ).toBe(14);
    expect(
      text.findBefore({ text: 'ALPHA-1 / alpha middle / alpha end', at: 'end' }, cursor)?.line,
    ).toBe(3);
    // A prompt by its start, even when wrapped over two lines.
    expect(
      text.findBefore(
        {
          text: 'Reply with exactly these three lines and nothing else: ALPHA-1 / alpha middle / alpha end',
          at: 'start',
        },
        cursor,
      )?.line,
    ).toBe(0);
    expect(text.findBefore({ text: 'Not on the screen at all', at: 'end' }, cursor)).toBeNull();
  });

  it('searches on from an earlier match, so equal texts are told apart by order', () => {
    const text = new LineText(['⏺ Done, all good.', '❯ again', '⏺ Done, all good.', '❯']);
    const last = text.findBefore({ text: 'Done, all good.', at: 'end' }, text.endOf(3));
    expect(last?.line).toBe(2);
    expect(text.findBefore({ text: 'Done, all good.', at: 'end' }, last?.offset ?? 0)?.line).toBe(
      0,
    );
  });

  it("finds a prompt only where it starts a line, not inside Claude's output", () => {
    // Searched from the response up, as after a resize: "four" also ends the line above it.
    const text = new LineText([
      '❯ four',
      '  answer 0 to four',
      '  then four',
      '⏺ Answer four.',
      '',
      '❯',
    ]);
    const response = text.findBefore({ text: 'Answer four.', at: 'end' }, text.endOf(5));
    expect(response?.line).toBe(3);
    expect(text.findBefore({ text: 'four', at: 'start' }, response?.offset ?? 0)?.line).toBe(0);
    // A prompt not at a line's start anywhere isn't found.
    expect(text.findBefore({ text: 'then four', at: 'start' }, text.endOf(5))?.line).toBe(2);
    expect(text.findBefore({ text: 'to four', at: 'start' }, text.endOf(5))).toBeNull();
  });

  it('finds a response whose Markdown shows differently, by its last line', () => {
    // As Claude Code shows a table, a link (with its address) and a code block.
    const text = new LineText([
      '⏺ Name   │ Value',
      '  Alpha  │ 1',
      '  Bravo  │ 2',
      '',
      '  Example (https://example.com)',
      '',
      '  echo done-HOTEL',
      '',
      '✻ Baked for 1s · done 9:30 AM',
      '❯',
    ]);
    const response =
      '| Name | Value |\n|------|-------|\n| Alpha | 1 |\n| Bravo | 2 |\n\n[Example](https://example.com)\n\n```bash\necho done-HOTEL\n```';
    expect(text.findBefore({ text: response, at: 'end' }, text.endOf(9))?.line).toBe(6);
  });
});
