/**
 * Finding a prompt or response in a Claude terminal's lines by its text (spec
 * §6.8). Claude Code renders Markdown, wraps lines and adds its own symbols
 * (❯, ⏺, list bullets, table borders), so both sides are compared by their
 * letters and digits only. A prompt is found only on a line where Claude Code
 * shows a sent prompt: `❯` at the line's start, its text after it.
 */

/**
 * Letters and digits only. Markdown links count by their text, and code fence
 * lines not at all (Claude Code doesn't show them, nor their language).
 */
export function letters(text: string): string {
  return text
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** How much of a response identifies it: its last 40 letters and digits. */
const KEY_LENGTH = 40;
/** Shorter keys would match too much (an answer "ok"). */
const MIN_KEY = 4;
/** The shorter keys tried next, for Markdown shown differently on screen. */
const SHORT_KEY = 16;
const MIN_SHORT_KEY = 8;

/**
 * The keys a response is looked for by, best first: its last 40 letters and
 * digits, then 16, then its last line alone. The shorter ones find a response
 * whose earlier Markdown shows differently on screen (a link with its
 * address, say).
 */
export function keysOf(text: string): string[] {
  const all = letters(text);
  if (all.length < MIN_KEY) return [];
  const lines = text.split('\n').map(letters).filter(Boolean);
  const keys = [all.slice(-KEY_LENGTH)];
  for (const short of [all.slice(-SHORT_KEY), lines.at(-1) ?? '']) {
    if (short.length >= MIN_SHORT_KEY && !keys.includes(short)) keys.push(short);
  }
  return keys;
}

/**
 * A line where Claude Code shows a sent prompt: `❯` (`>` in older versions) at
 * its start, then the prompt. Claude's answers and tool output are indented,
 * so their lines never start so, even when they repeat a prompt's words.
 */
const PROMPT_LINE = /^[❯>] \S/;
/** A prompt's further lines: indented by Claude, or wrapped by the terminal. */
const PROMPT_MORE = /^ {2}(?! *⎿)\S/;
/** Prompts shorter than this must show in full; longer ones by their start. */
const PROMPT_KEY = 40;

/** One line of the terminal: its text, and whether it continues the line above (wrapped). */
export type Line = string | { text: string; wrapped: boolean };

/** Terminal lines joined by their letters and digits, with each line's offset. */
export class LineText {
  private readonly joined: string;
  /** Offset of each line's first letter in `joined`. */
  private readonly starts: number[] = [];
  /** For each line, the last line of the prompt shown from it (-1: no prompt line). */
  private readonly prompts: number[] = [];

  constructor(lines: readonly Line[]) {
    let joined = '';
    const texts = lines.map((l) => (typeof l === 'string' ? l : l.text));
    for (const line of texts) {
      this.starts.push(joined.length);
      joined += letters(line);
    }
    this.joined = joined;
    for (let y = 0; y < texts.length; y++) {
      const line = lines[y] as Line;
      if ((typeof line !== 'string' && line.wrapped) || !PROMPT_LINE.test(texts[y] as string)) {
        this.prompts.push(-1);
        continue;
      }
      let end = y + 1;
      for (; end < texts.length; end++) {
        const next = lines[end] as Line;
        if (typeof next !== 'string' && next.wrapped) continue;
        if (!PROMPT_MORE.test(texts[end] as string)) break;
      }
      this.prompts.push(end - 1);
    }
  }

  /** The line holding offset `at` of the joined text. */
  private lineAt(at: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((this.starts[mid] as number) <= at) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /** Where line `line` ends in the joined text (its last letter + 1). */
  endOf(line: number): number {
    return line + 1 < this.starts.length ? (this.starts[line + 1] as number) : this.joined.length;
  }

  /**
   * The last line before offset `before` (and after line `after`) where
   * Claude Code shows this prompt: a prompt line whose text, with the lines
   * that continue it, is the prompt's (40 letters and digits at least, else
   * all of them). Null when there is none, or the prompt has no letters.
   */
  findPrompt(prompt: string, before: number, after = -1): { line: number; offset: number } | null {
    const wanted = letters(prompt);
    if (wanted.length === 0) return null;
    for (let y = this.prompts.length - 1; y > after; y--) {
      const start = this.starts[y] as number;
      if (start >= before) continue;
      if (this.promptAt(y, wanted)) return { line: y, offset: start };
    }
    return null;
  }

  /** Whether line `line` is a prompt line showing this prompt (see findPrompt). */
  showsPrompt(line: number, prompt: string): boolean {
    const wanted = letters(prompt);
    return wanted.length > 0 && this.promptAt(line, wanted);
  }

  private promptAt(line: number, wanted: string): boolean {
    const last = this.prompts[line] ?? -1;
    if (last === -1) return false;
    const start = this.starts[line] as number;
    // All of it, ending with one of its lines: output may follow without a blank line.
    for (let y = line; y <= last; y++) {
      if (this.joined.slice(start, this.endOf(y)) === wanted) return true;
    }
    if (wanted.length <= PROMPT_KEY) return false;
    // Long: at least its first 40, up to as much as is shown (Claude may cut a long paste).
    const shown = this.joined.slice(start, this.endOf(last));
    return shown.length >= PROMPT_KEY && (shown.startsWith(wanted) || wanted.startsWith(shown));
  }

  /**
   * The last occurrence of a response's end that ends at or before offset
   * `before`: the line it ends on, and its start offset, to search on from.
   */
  findResponse(text: string, before: number): { line: number; offset: number } | null {
    for (const key of keysOf(text)) {
      if (before < key.length) continue;
      const at = this.joined.lastIndexOf(key, before - key.length);
      if (at === -1) continue;
      return { line: this.lineAt(at + key.length - 1), offset: at };
    }
    return null;
  }
}
