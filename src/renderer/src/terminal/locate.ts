/**
 * Finding a prompt or response in a Claude terminal's lines by its text (spec
 * §6.8). Claude Code renders Markdown, wraps lines and adds its own symbols
 * (❯, ⏺, list bullets, table borders), so both sides are compared by their
 * letters and digits only.
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

/** How much of a text identifies it: its first or last 40 letters and digits. */
const KEY_LENGTH = 40;
/** Shorter keys would match too much (an answer "ok"). */
const MIN_KEY = 4;
/** The shorter keys tried next, for Markdown shown differently on screen. */
const SHORT_KEY = 16;
const MIN_SHORT_KEY = 8;

/** A prompt is found by its start, a response by its end. */
export type Needle = { text: string; at: 'start' | 'end' };

/**
 * The keys a text is looked for by, best first: its first or last 40 letters
 * and digits, then 16, then its first or last line alone. The shorter ones
 * find a response whose earlier Markdown shows differently on screen (a link
 * with its address, say).
 */
export function keysOf({ text, at }: Needle): string[] {
  const all = letters(text);
  if (all.length < MIN_KEY) return [];
  const lines = text.split('\n').map(letters).filter(Boolean);
  const edge = (s: string, n: number) => (at === 'start' ? s.slice(0, n) : s.slice(-n));
  const keys = [edge(all, KEY_LENGTH)];
  for (const short of [edge(all, SHORT_KEY), (at === 'start' ? lines[0] : lines.at(-1)) ?? '']) {
    if (short.length >= MIN_SHORT_KEY && !keys.includes(short)) keys.push(short);
  }
  return keys;
}

/** Terminal lines joined by their letters and digits, with each line's offset. */
export class LineText {
  private readonly joined: string;
  /** Offset of each line's first letter in `joined`. */
  private readonly starts: number[] = [];

  constructor(lines: readonly string[]) {
    let joined = '';
    for (const line of lines) {
      this.starts.push(joined.length);
      joined += letters(line);
    }
    this.joined = joined;
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
   * The last occurrence of the needle that ends at or before offset `before`:
   * the line of its start or end, and its start offset, to search on from.
   * A prompt starts its line (Claude Code shows it after ❯), so a prompt's
   * text inside another line, such as Claude's answer, doesn't count.
   */
  findBefore(needle: Needle, before: number): { line: number; offset: number } | null {
    for (const key of keysOf(needle)) {
      for (let from = before - key.length; from >= 0; ) {
        const at = this.joined.lastIndexOf(key, from);
        if (at === -1) break;
        const line = this.lineAt(needle.at === 'start' ? at : at + key.length - 1);
        if (needle.at === 'end' || this.starts[line] === at) return { line, offset: at };
        from = at - 1;
      }
    }
    return null;
  }
}
