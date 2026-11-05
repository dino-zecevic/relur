import fs from 'node:fs';
import path from 'node:path';
import { formatShortcut, SHORTCUTS, shortcutsByGroup } from '@shared/shortcuts';
import { describe, expect, it } from 'vitest';
import { buildPages, fill, headings, isGuideAction, SECTIONS } from './content';
import { imageFiles, pageFiles } from './files';
import { images, links, parsePage } from './markdown';

const files = pageFiles();

/**
 * Every Guide target written in the renderer's source: `<GuideLink to="…">`,
 * `data-guide-to="…"` and `openGuide('…')`. A `<GuideLink` whose `to` isn't a
 * string literal fails, so no link escapes the check.
 */
function deepLinks(): { file: string; href: string }[] {
  const root = path.join(__dirname, '..');
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) sources.push(full);
    }
  };
  walk(root);
  const out: { file: string; href: string }[] = [];
  for (const full of sources) {
    const file = path.relative(root, full);
    const code = fs.readFileSync(full, 'utf8');
    const tags = code.match(/<GuideLink\b/g)?.length ?? 0;
    const literal = [...code.matchAll(/<GuideLink\s+to="([^"]+)"/g)].map((m) => m[1] as string);
    if (literal.length !== tags) out.push({ file, href: '<GuideLink without a literal to="…">' });
    const others = [
      ...code.matchAll(/data-guide-to="([^"]+)"/g),
      ...code.matchAll(/openGuide(?:Ref\.current)?\(\s*'([^']+)'/g),
    ].map((m) => m[1] as string);
    for (const href of [...literal, ...others]) out.push({ file, href });
  }
  return out;
}

describe.each([
  ['macOS', true],
  ['Linux', false],
])('the Guide on %s', (_name, mac) => {
  const pages = buildPages(files, mac);

  it('has one Markdown file per page, and no file outside the contents', () => {
    const listed = SECTIONS.flatMap((s) => s.pages);
    const onDisk = fs
      .readdirSync(path.join(__dirname, 'pages'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
    expect(onDisk.sort()).toEqual([...listed].sort());
    expect(new Set(listed).size).toBe(listed.length);
    for (const page of pages) expect(page.title, page.id).not.toBe('');
  });

  it('resolves every relative link and anchor', () => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const broken: string[] = [];
    for (const page of pages) {
      for (const href of links(page.blocks)) {
        if (/^https?:/.test(href)) continue;
        if (href.startsWith('app:')) {
          if (!isGuideAction(href)) broken.push(`${page.id}: ${href} (no action)`);
          continue;
        }
        const [target = '', anchor] = href.split('#');
        const linked = byId.get(target || page.id);
        if (!linked) broken.push(`${page.id}: ${href} (no page)`);
        else if (anchor && !headings(linked.blocks).some((h) => h.id === anchor)) {
          broken.push(`${page.id}: ${href} (no heading)`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('resolves every deep link the app opens the Guide at', () => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const broken: string[] = [];
    const found = deepLinks();
    expect(found.length).toBeGreaterThan(10);
    for (const { file, href } of found) {
      const [target = '', anchor] = href.split('#');
      const linked = byId.get(target);
      if (!linked) broken.push(`${file}: ${href} (no page)`);
      else if (anchor && !headings(linked.blocks).some((h) => h.id === anchor)) {
        broken.push(`${file}: ${href} (no heading)`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('has unique headings on each page', () => {
    for (const page of pages) {
      const ids = headings(page.blocks).map((h) => h.id);
      expect(new Set(ids).size, page.id).toBe(ids.length);
    }
  });

  it('lists exactly the shortcut definitions on the Keyboard shortcuts page', () => {
    const page = pages.find((p) => p.id === 'shortcuts');
    const shown = (page?.blocks ?? []).flatMap((b) => (b.t === 'keys' ? b.rows : []));
    const expected = shortcutsByGroup(mac).flatMap((g) =>
      g.shortcuts.map((s) => ({ keys: formatShortcut(s, mac), label: s.label })),
    );
    expect(shown).toEqual(expected);
    expect(headings(page?.blocks ?? []).map((h) => h.text)).toEqual(
      shortcutsByGroup(mac).map((g) => g.group),
    );
  });
});

describe('Guide placeholders', () => {
  it('fills names from BRAND and keys from the shortcut definitions', () => {
    expect(fill('{{key:newWorkspace}} {{key:changes}}', true)).toBe('⌘N ⇧⌘D');
    expect(fill('{{key:newWorkspace}} {{key:changes}}', false)).toBe('Ctrl+Shift+N Ctrl+Shift+D');
    expect(fill('{{keys:workspaceStep}} {{keys:profile}}', true)).toBe('⌥↑ / ⌥↓ ⌘1 – ⌘9');
    expect(fill('{{keys:workspaceStep}} {{keys:profile}}', false)).toBe(
      'Alt+Up / Alt+Down Ctrl+1 – Ctrl+9',
    );
    expect(() => fill('{{key:nope}}', true)).toThrow(/Unknown Guide placeholder/);
    expect(() => fill('{{keys:nope}}', true)).toThrow(/Unknown Guide placeholder/);
    expect(() => fill('{{bogus}}', true)).toThrow(/Unknown Guide placeholder/);
  });

  it('keeps macOS-only and Linux-only text to its platform', () => {
    const text = 'Use {{mac}}the Dock{{/mac}}{{other}}the taskbar{{/other}}: {{reveal}}.';
    expect(fill(text, true)).toBe('Use the Dock: Reveal in Finder.');
    expect(fill(text, false)).toBe('Use the taskbar: Show in folder.');
    expect(fill('{{configDir}}', false)).toMatch(/^~\/\.config\//);
  });

  it('shows no macOS key symbols, Finder or the Dock on Linux (docks by name are fine)', () => {
    for (const page of buildPages(pageFiles(), false)) {
      expect(page.text, page.id).not.toMatch(/[⌘⌥⇧⌃]|\bFinder\b|(?<!Ubuntu |Dash to )\bDock\b/);
    }
  });

  it('leaves no placeholder unfilled', () => {
    for (const page of buildPages(files, true)) expect(page.text, page.id).not.toMatch(/\{\{/);
  });

  it('parses the article blocks of the design', () => {
    const page = parsePage(
      '# T\nText with `code`, **bold**, [a link](x#y) and <kbd>⌘N</kbd>.\n## Part\n- one\n1. first\n| A | B |\n| --- | --- |\n| `c` | d |\n```zsh\n# comment\nls\n```\n:::tip\nInside.\n:::\n:::keys\n⌘1 – ⌘9 | Switch\n:::\n:::glyphs\n:::\n:::diagram\n:::',
    );
    expect(page.title).toBe('T');
    expect(page.blocks.map((b) => b.t)).toEqual([
      'p',
      'h2',
      'list',
      'list',
      'table',
      'code',
      'callout',
      'keys',
      'glyphs',
      'diagram',
    ]);
    expect(links(page.blocks)).toEqual(['x#y']);
  });

  it('defines every shortcut with at least one chord', () => {
    for (const [id, s] of Object.entries(SHORTCUTS)) expect(s.chords.length, id).toBeGreaterThan(0);
  });
});

describe('the Guide screenshots', () => {
  const pages = buildPages(files, true);
  const used = pages.flatMap((p) => images(p.blocks).map((i) => ({ page: p.id, ...i })));
  const onDisk = imageFiles();

  it('has a dark and a light file and alt text for every screenshot a page shows', () => {
    for (const { page, name, alt } of used) {
      expect(onDisk[name]?.dark, `${page}: ${name}-dark.webp`).toBeTruthy();
      expect(onDisk[name]?.light, `${page}: ${name}-light.webp`).toBeTruthy();
      expect(alt.trim().length, `${page}: alt text of ${name}`).toBeGreaterThan(10);
    }
  });

  it('shows every screenshot file somewhere, each once', () => {
    const names = used.map((u) => u.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(onDisk).sort()).toEqual([...names].sort());
  });

  it('keeps every file small', () => {
    const dir = path.join(__dirname, 'images');
    for (const file of fs.readdirSync(dir)) {
      expect(fs.statSync(path.join(dir, file)).size, file).toBeLessThan(150 * 1024);
    }
  });

  it('parses a screenshot only on a line of its own', () => {
    expect(parsePage('# T\n\n![The sidebar](images/sidebar.webp)\n').blocks).toEqual([
      { t: 'image', name: 'sidebar', alt: 'The sidebar' },
    ]);
    expect(() => parsePage('![x](sidebar.png)')).toThrow(/images/);
  });
});
