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
    expect(keysOf('ok')).toEqual([]);
    expect(keysOf(`${'a'.repeat(50)}\nlast line END`)).toEqual([
      `${'a'.repeat(29)}lastlineEND`,
      `aaaaalastlineEND`,
      'lastlineEND',
    ]);
  });

  it("finds a response's last line above the cursor, across Markdown and wrapping", () => {
    const text = new LineText(SCREEN);
    const cursor = text.endOf(19);
    expect(
      text.findResponse('1. Red\n2. Blue\n3. Green\n4. Yellow\n\nCHARLIE-3 end', cursor)?.line,
    ).toBe(14);
    expect(text.findResponse('ALPHA-1 / alpha middle / alpha end', cursor)?.line).toBe(3);
    // A prompt on its prompt line, even when wrapped over two lines.
    expect(
      text.findPrompt(
        'Reply with exactly these three lines and nothing else: ALPHA-1 / alpha middle / alpha end',
        cursor,
      )?.line,
    ).toBe(0);
    expect(text.findResponse('Not on the screen at all', cursor)).toBeNull();
  });

  it('searches on from an earlier match, so equal texts are told apart by order', () => {
    const text = new LineText(['⏺ Done, all good.', '❯ again', '⏺ Done, all good.', '❯']);
    const last = text.findResponse('Done, all good.', text.endOf(3));
    expect(last?.line).toBe(2);
    expect(text.findResponse('Done, all good.', last?.offset ?? 0)?.line).toBe(0);
  });

  // As the real Claude Code (2.1.318) showed it: answer lines repeating the prompts' words.
  const REPEATED = [
    '❯ AB-10247 backend: answer with exactly these two lines, nothing else: AB-10247 backend is fine /',
    '  AB-10247 frontend is next',
    '',
    '⏺ AB-10247 backend is fine',
    '  AB-10247 frontend is next',
    '',
    '❯ AB-10247 frontend',
    '',
    '⏺ AB-10247 frontend',
    '  - AB-10247 frontend, done',
    '  ⎿  AB-10247 frontend',
    '',
    '❯ ok',
    '',
    '⏺ ok',
  ];

  it("finds a prompt only on Claude's prompt line, never in an answer repeating it", () => {
    const text = new LineText(REPEATED);
    const end = text.endOf(REPEATED.length - 1);
    expect(text.findPrompt('AB-10247 frontend', end)?.line).toBe(6);
    expect(text.findPrompt('ok', end)?.line).toBe(12);
    expect(
      text.findPrompt(
        'AB-10247 backend: answer with exactly these two lines, nothing else: AB-10247 backend is fine / AB-10247 frontend is next',
        end,
      )?.line,
    ).toBe(0);
    // Its start alone, or a shorter prompt that begins it, isn't that prompt.
    expect(text.findPrompt('AB-10247 backend', end)).toBeNull();
    expect(text.findPrompt('AB-10247 frontend is next', end)).toBeNull();
    // Below a line already taken, an earlier equal prompt doesn't count.
    expect(text.findPrompt('AB-10247 frontend', end, 6)).toBeNull();
    expect(text.findPrompt('', end)).toBeNull();
    expect(text.showsPrompt(6, 'AB-10247 frontend')).toBe(true);
    expect(text.showsPrompt(8, 'AB-10247 frontend')).toBe(false);
  });

  it('follows a prompt over lines the terminal wrapped, not over the next one', () => {
    const prompt = 'Explain the build of this project in a few words please, then stop here';
    const text = new LineText([
      { text: '❯ Explain the build of this project in a few', wrapped: false },
      { text: 'words please, then stop here', wrapped: true },
      { text: '', wrapped: false },
      { text: '⏺ Sure', wrapped: false },
      { text: '❯ ok', wrapped: true },
    ]);
    expect(text.findPrompt(prompt, text.endOf(4))?.line).toBe(0);
    expect(text.findPrompt('ok', text.endOf(4))).toBeNull();
  });

  it("finds a short prompt on its ❯ line only, not inside Claude's output", () => {
    // Searched from the response up, as after a resize: "four" also ends the line above it.
    const text = new LineText([
      '❯ four',
      '  answer 0 to four',
      '  then four',
      '⏺ Answer four.',
      '',
      '❯',
    ]);
    const response = text.findResponse('Answer four.', text.endOf(5));
    expect(response?.line).toBe(3);
    expect(text.findPrompt('four', response?.offset ?? 0)?.line).toBe(0);
    // Output lines aren't prompt lines, even where the text begins one.
    expect(text.findPrompt('then four', text.endOf(5))).toBeNull();
    expect(text.findPrompt('to four', text.endOf(5))).toBeNull();
  });

  it('finds prompts as Claude Code 2.1.318 shows them: padded to the width, wrapped by Claude', () => {
    // From the live check: each prompt line keeps the spaces Claude pads it with.
    const pad = (line: string) => line.padEnd(100, ' ');
    const text = new LineText([
      pad(
        '❯ Reply with only the word yes. This prompt is deliberately long so that it wraps past the right',
      ),
      pad('  edge of a one hundred column terminal window'),
      '',
      '⏺ yes',
      '',
      pad('❯ Reply with only the word no.'),
      pad('  This is the second line of the prompt'),
      '',
      '⏺ no',
      '',
      '─'.repeat(100),
      '❯ ',
    ]);
    const before = text.endOf(9);
    expect(
      text.findPrompt(
        'Reply with only the word yes. This prompt is deliberately long so that it wraps past the right edge of a one hundred column terminal window',
        before,
      )?.line,
    ).toBe(0);
    expect(
      text.findPrompt('Reply with only the word no.\nThis is the second line of the prompt', before)
        ?.line,
    ).toBe(5);
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
    expect(text.findResponse(response, text.endOf(9))?.line).toBe(6);
  });
});
