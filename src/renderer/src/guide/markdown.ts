/**
 * The Guide's Markdown (components.md, Guide › Article blocks): headings,
 * paragraphs, lists, tables, code blocks, and `:::` blocks for callouts, key
 * rows, the status glyph legend and the building-blocks diagram, and
 * screenshots on a line of their own, `![alt](images/<name>.webp)`. Inline:
 * `code`, **bold**, [links](page#section) and <kbd>keys</kbd>. Only what the
 * Guide's own pages use; no HTML is passed through.
 */

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'code'; text: string }
  | { t: 'bold'; children: Inline[] }
  | { t: 'link'; href: string; children: Inline[] }
  | { t: 'kbd'; text: string };

export type CalloutKind = 'tip' | 'note' | 'warning';

export type Block =
  | { t: 'h2'; text: string; id: string }
  | { t: 'p'; inline: Inline[] }
  | { t: 'list'; ordered: boolean; items: Inline[][] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'code'; lang: string; lines: string[] }
  | { t: 'callout'; kind: CalloutKind; title: string; blocks: Block[] }
  | { t: 'keys'; rows: { keys: string; label: string }[] }
  | { t: 'image'; name: string; alt: string }
  | { t: 'glyphs' }
  | { t: 'diagram' };

export interface ParsedPage {
  title: string;
  blocks: Block[];
}

/** A heading's anchor id. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Inline marks of one line of text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|<kbd>(.+?)<\/kbd>/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: 'text', text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'bold', children: parseInline(m[2]) });
    else if (m[3] !== undefined && m[4] !== undefined) {
      out.push({ t: 'link', href: m[4], children: parseInline(m[3]) });
    } else if (m[5] !== undefined) out.push({ t: 'kbd', text: m[5] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) });
  return out;
}

const CALLOUT_TITLE: Record<CalloutKind, string> = { tip: 'Tip', note: 'Note', warning: 'Warning' };
const LIST_ITEM = /^(- |\d+\. )/;
/** A screenshot: `images/<name>.webp`, shown as `<name>-dark.webp` or `<name>-light.webp`. */
export const IMAGE = /^!\[([^\]]*)\]\(images\/([a-z0-9-]+)\.webp\)$/;
const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** Parses a page; the `# ` line is its title. */
export function parsePage(markdown: string): ParsedPage {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const { blocks, title } = parseBlocks(lines);
  return { title, blocks };
}

function parseBlocks(lines: string[]): { blocks: Block[]; title: string } {
  const blocks: Block[] = [];
  let title = '';
  let para: string[] = [];
  const flush = () => {
    if (para.length > 0) blocks.push({ t: 'p', inline: parseInline(para.join(' ')) });
    para = [];
  };
  for (let i = 0; i < lines.length; ) {
    const line = lines[i] as string;
    if (line.startsWith('# ')) {
      flush();
      title = line.slice(2).trim();
      i++;
    } else if (line.startsWith('## ')) {
      flush();
      const text = line.slice(3).trim();
      blocks.push({ t: 'h2', text, id: slug(text) });
      i++;
    } else if (line.startsWith('```')) {
      flush();
      const lang = line.slice(3).trim() || 'shell';
      const code: string[] = [];
      for (i++; i < lines.length && !(lines[i] as string).startsWith('```'); i++) {
        code.push(lines[i] as string);
      }
      i++;
      blocks.push({ t: 'code', lang, lines: code });
    } else if (line.startsWith(':::')) {
      flush();
      const [kind = '', ...rest] = line.slice(3).trim().split(' ');
      const body: string[] = [];
      for (i++; i < lines.length && (lines[i] as string).trim() !== ':::'; i++) {
        body.push(lines[i] as string);
      }
      i++;
      if (kind === 'tip' || kind === 'note' || kind === 'warning') {
        blocks.push({
          t: 'callout',
          kind,
          title: rest.join(' ') || CALLOUT_TITLE[kind],
          blocks: parseBlocks(body).blocks,
        });
      } else if (kind === 'keys') {
        blocks.push({
          t: 'keys',
          rows: body
            .filter((l) => l.includes('|'))
            .map((l) => {
              const at = l.lastIndexOf('|');
              return { keys: l.slice(0, at).trim(), label: l.slice(at + 1).trim() };
            }),
        });
      } else if (kind === 'glyphs' || kind === 'diagram') {
        blocks.push({ t: kind });
      } else {
        throw new Error(`Unknown block ":::${kind}"`);
      }
    } else if (line.startsWith('![')) {
      flush();
      const m = line.trim().match(IMAGE);
      if (!m)
        throw new Error(`An image must be ![alt](images/<name>.webp) on its own line: ${line}`);
      blocks.push({ t: 'image', alt: m[1] as string, name: m[2] as string });
      i++;
    } else if (line.startsWith('|')) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && (lines[i] as string).startsWith('|'); i++) {
        if (!/^\|\s*:?-/.test(lines[i] as string)) rows.push(cells(lines[i] as string));
      }
      const [head = [], ...rest] = rows;
      blocks.push({
        t: 'table',
        head: head.map(parseInline),
        rows: rest.map((r) => r.map(parseInline)),
      });
    } else if (LIST_ITEM.test(line)) {
      flush();
      const ordered = /^\d/.test(line);
      const items: Inline[][] = [];
      const sameKind = (l: string) => LIST_ITEM.test(l) && /^\d/.test(l) === ordered;
      for (; i < lines.length && sameKind(lines[i] as string); i++) {
        items.push(parseInline((lines[i] as string).replace(LIST_ITEM, '')));
      }
      blocks.push({ t: 'list', ordered, items });
    } else if (!line.trim()) {
      flush();
      i++;
    } else {
      para.push(line.trim());
      i++;
    }
  }
  flush();
  return { blocks, title };
}

/** The screenshots in the page's blocks. */
export const images = (blocks: Block[]): { name: string; alt: string }[] =>
  blocks.flatMap((b) =>
    b.t === 'image' ? [{ name: b.name, alt: b.alt }] : b.t === 'callout' ? images(b.blocks) : [],
  );

/** Every link target in the page's blocks, for checking them. */
export function links(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (inline: Inline[]) => {
    for (const i of inline) {
      if (i.t === 'link') {
        out.push(i.href);
        walk(i.children);
      } else if (i.t === 'bold') walk(i.children);
    }
  };
  for (const b of blocks) {
    if (b.t === 'p') walk(b.inline);
    else if (b.t === 'list') b.items.forEach(walk);
    else if (b.t === 'table') {
      for (const row of [b.head, ...b.rows]) row.forEach(walk);
    } else if (b.t === 'callout') out.push(...links(b.blocks));
  }
  return out;
}

/** The page as plain text, for search. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^!\[.*$/gm, '')
    .replace(/^#+ /gm, '')
    .replace(/^:::.*$/gm, '')
    .replace(/^```.*$/gm, '')
    .replace(/<\/?kbd>/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\|\s*:?-.*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
