// biome-ignore-all lint/suspicious/noArrayIndexKey: the Guide's static content never reorders
import { BRAND } from '@shared/brand';
import { matchShortcut } from '@shared/shortcuts';
import type { StatusGlyph as Glyph } from '@shared/status';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { trpcClient } from '../trpc';
import { iconButton, isMac, Kbd, keyHint } from '../ui/controls';
import { StatusGlyph } from '../ui/StatusGlyph';
import {
  buildPages,
  type GuidePage,
  headings,
  imageFiles,
  isGuideAction,
  pageFiles,
  SECTIONS,
} from './content';
import type { Block, Inline } from './markdown';

/** Built once: the pages don't change while the app runs. */
let built: GuidePage[] | null = null;
export function guidePages(): GuidePage[] {
  built ??= buildPages(pageFiles(), isMac);
  return built;
}

/** The screenshots' URLs, by name. */
const images = imageFiles();

/** Where the Guide opens: a page and, for a deep link, one of its sections. */
export interface GuideTarget {
  page: string;
  section?: string | null;
}

/** "page#section" as a target. */
export const target = (href: string): GuideTarget => {
  const [page = '', section] = href.split('#');
  return { page, section: section ?? null };
};

const GLYPHS: [Glyph, string, string, string][] = [
  ['working', 'Working', 'Spinner', 'Claude is working, or setup is running. Nothing to do yet.'],
  [
    'permission',
    'Needs permission',
    'Amber triangle',
    'Claude wants to run a command or edit a file and waits for your OK.',
  ],
  [
    'input',
    'Waiting for input',
    'Pink ring',
    'Claude asked you something and waits for your answer.',
  ],
  [
    'approval',
    'Awaiting approval',
    'Purple diamond',
    "Your skills stopped at a workflow gate and wait for you. The row shows the gate's name.",
  ],
  [
    'done',
    'Done, not looked at yet',
    'Filled dot',
    'Claude finished its turn. The dot clears when you open the workspace.',
  ],
  ['exited', 'Exited', 'Hollow square', 'The Claude process has ended. Start it again in its tab.'],
  ['error', 'Error', '✕', 'Something failed: setup, or Claude could not start.'],
  [
    'unfinished',
    'Unfinished',
    'Two bars',
    `${BRAND.displayName} closed while Claude was at work there. Open it to continue or dismiss.`,
  ],
];

const kbdClass =
  'inline-flex h-[19px] min-w-5 items-center justify-center rounded-[4px] border border-b-2 border-line-strong bg-raised px-1.5 font-mono text-[11.5px] font-medium whitespace-nowrap text-fg';

function InlineText({ inline, onLink }: { inline: Inline[]; onLink: (href: string) => void }) {
  return (
    <>
      {inline.map((part, i) => {
        const key = i;
        switch (part.t) {
          case 'text':
            return <span key={key}>{part.text}</span>;
          case 'code':
            return (
              <code
                key={key}
                className="rounded-sm border border-line bg-surface px-[5px] font-mono text-[0.88em]"
              >
                {part.text}
              </code>
            );
          case 'bold':
            return (
              <strong key={key} className="font-semibold">
                <InlineText inline={part.children} onLink={onLink} />
              </strong>
            );
          case 'kbd':
            return (
              <kbd key={key} className={kbdClass}>
                {part.text}
              </kbd>
            );
          case 'link':
            return (
              <a
                key={key}
                href={`#${part.href}`}
                data-guide-link={part.href}
                className="underline decoration-line-strong underline-offset-[3px] hover:decoration-fg"
                onClick={(e) => {
                  e.preventDefault();
                  onLink(part.href);
                }}
              >
                <InlineText inline={part.children} onLink={onLink} />
              </a>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function CodeBlock({ lang, lines }: { lang: string; lines: string[] }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  // Comment lines are shown, but only the commands are copied.
  const text = lines.filter((l) => !l.startsWith('#') || lang === 'json').join('\n');
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-term" data-code-block>
      <div className="flex h-7 items-center border-b border-line px-3 text-xs text-fg-subtle">
        <span className="font-mono">{lang}</span>
        <span className="flex-1" />
        <button
          type="button"
          className="text-fg-muted hover:text-fg"
          onClick={() =>
            void trpcClient.clipboard.writeText.mutate({ text }).then(() => setCopied(true))
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-[1.6]">
        {lines.map((line, i) => (
          <div
            key={i}
            className={line.startsWith('#') && lang !== 'json' ? 'text-fg-subtle' : 'text-fg'}
          >
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

const CALLOUT = {
  tip: {
    box: 'border-diff-add/40 bg-diff-add/8',
    icon: (
      <span className="mt-px flex size-4 flex-none items-center justify-center rounded-full border border-diff-add text-[10px] text-diff-add">
        →
      </span>
    ),
  },
  note: {
    box: 'border-line bg-surface',
    icon: (
      <span className="mt-px flex size-4 flex-none items-center justify-center rounded-full border border-fg-muted text-[9.5px] font-bold text-fg-muted">
        i
      </span>
    ),
  },
  warning: {
    box: 'border-st-permission/40 bg-st-permission/8',
    icon: (
      <span className="mt-[3px] h-[11px] w-3 flex-none bg-st-permission [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
    ),
  },
} as const;

/** A run of key chords: each chord is one key, `–` and `/` are separators. */
function Keys({ keys }: { keys: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.split(' ').map((part, i) =>
        part === '–' || part === '/' ? (
          <span key={i} className="px-0.5 text-sm text-fg-subtle">
            {part}
          </span>
        ) : (
          <kbd key={i} className={kbdClass}>
            {part}
          </kbd>
        ),
      )}
    </span>
  );
}

function Diagram() {
  const box =
    'flex min-w-0 flex-[1_1_150px] flex-col gap-1.5 rounded-md border border-line-strong bg-canvas p-3';
  const eyebrow = 'text-[10.5px] font-semibold tracking-[0.06em] text-fg-subtle uppercase';
  const caption = 'text-[11.5px] leading-[1.45] text-fg-muted';
  const has = (
    <div className="flex w-14 flex-none flex-col items-center justify-center gap-0.5 text-fg-subtle">
      <span className="text-[10.5px]">has</span>
      <span className="text-[15px] leading-none">→</span>
    </div>
  );
  return (
    <div
      data-guide-diagram
      className="flex flex-wrap items-stretch gap-y-2.5 rounded-lg border border-line bg-surface p-[18px]"
    >
      <div className={box}>
        <span className={eyebrow}>Profile</span>
        <span className="flex items-center gap-[7px] text-[13.5px] font-semibold">
          <span className="size-2 rounded-full bg-profile-blue" />
          Work
        </span>
        <span className={caption}>
          One Claude account
          <br />
          <span className="font-mono text-[11px]">~/.claude-work</span>
        </span>
      </div>
      {has}
      <div className={box}>
        <span className={eyebrow}>Project</span>
        <span className="font-mono text-[13px] font-medium">api-service</span>
        <span className={caption}>
          A git repository
          <br />
          <span className="font-mono text-[11px]">~/Code/api-service</span>
        </span>
      </div>
      {has}
      <div className={box}>
        <span className={eyebrow}>Workspace</span>
        <span className="text-[13px] font-medium">ENG-1423 Fix login timeout</span>
        <span className={caption}>
          One task: a worktree, a branch,
          <br />
          Claude and terminals
        </span>
      </div>
    </div>
  );
}

function BlockView({ block, onLink }: { block: Block; onLink: (href: string) => void }) {
  switch (block.t) {
    case 'h2':
      return <h2 className="pt-0.5 text-[17px] leading-[1.3] font-semibold">{block.text}</h2>;
    case 'p':
      return (
        <p className="text-[14px] leading-[1.6] text-pretty">
          <InlineText inline={block.inline} onLink={onLink} />
        </p>
      );
    case 'list':
      return (
        <div className="flex flex-col gap-1.5 text-[14px] leading-[1.6]">
          {block.items.map((item, i) => (
            <div key={i} className="grid grid-cols-[22px_1fr]">
              <span
                className={
                  block.ordered ? 'font-mono text-[13px] text-fg-subtle' : 'text-fg-subtle'
                }
              >
                {block.ordered ? `${i + 1}.` : '•'}
              </span>
              <span className="text-pretty">
                <InlineText inline={item} onLink={onLink} />
              </span>
            </div>
          ))}
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[13px] leading-[1.5]">
            <thead>
              <tr className="bg-surface text-sm text-fg-muted">
                {block.head.map((cell, i) => (
                  <th key={i} className="px-3.5 py-2 text-left font-medium">
                    <InlineText inline={cell} onLink={onLink} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-t border-line align-top">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-3.5 py-2 ${c === 0 ? 'font-medium' : 'text-fg-muted'}`}
                    >
                      <InlineText inline={cell} onLink={onLink} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'code':
      return <CodeBlock lang={block.lang} lines={block.lines} />;
    case 'callout': {
      const style = CALLOUT[block.kind];
      return (
        <div
          data-callout={block.kind}
          className={`flex gap-3 rounded-lg border px-3.5 py-3 ${style.box}`}
        >
          {style.icon}
          <div className="flex min-w-0 flex-col gap-1 text-[13.5px] leading-[1.55]">
            <span className="font-semibold">{block.title}</span>
            {block.blocks.map((b, i) => (
              <BlockView key={i} block={b} onLink={onLink} />
            ))}
          </div>
        </div>
      );
    }
    case 'keys':
      return (
        <div className="overflow-hidden rounded-lg border border-line" data-guide-keys>
          {block.rows.map((row, i) => (
            <div
              key={i}
              className={`grid min-h-[38px] grid-cols-[minmax(150px,40%)_1fr] items-center gap-3 px-3.5 py-1.5 text-[13.5px] ${i ? 'border-t border-line' : ''}`}
            >
              <Keys keys={row.keys} />
              <span>{row.label}</span>
            </div>
          ))}
        </div>
      );
    case 'glyphs':
      return (
        <div className="overflow-hidden rounded-lg border border-line" data-guide-glyphs>
          {GLYPHS.map(([glyph, name, shape, meaning], i) => (
            <div
              key={glyph}
              className={`flex items-center gap-3.5 px-3.5 py-[9px] ${i ? 'border-t border-line' : ''}`}
            >
              <span className="flex size-7 flex-none items-center justify-center rounded-md border border-line bg-surface">
                <StatusGlyph glyph={glyph} />
              </span>
              <span className="flex w-[170px] flex-none flex-col gap-px">
                <span className="text-[13px] font-semibold">{name}</span>
                <span className="text-[11.5px] text-fg-subtle">{shape}</span>
              </span>
              <span className="min-w-0 text-[13px] leading-[1.5] text-pretty text-fg-muted">
                {meaning}
              </span>
            </div>
          ))}
        </div>
      );
    case 'diagram':
      return <Diagram />;
    case 'image':
      return <Screenshot name={block.name} alt={block.alt} />;
  }
}

/**
 * A screenshot in the variant of the app's theme (spec §6.12), at half its
 * pixel size: they are taken at 2x. Its alt text is the caption too.
 */
function Screenshot({ name, alt }: { name: string; alt: string }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const files = images[name];
  const img = (theme: 'dark' | 'light', className: string) => (
    <img
      src={files?.[theme]}
      alt={alt}
      data-guide-image={`${name}-${theme}`}
      width={size?.width}
      height={size?.height}
      onLoad={(e) =>
        setSize({
          width: e.currentTarget.naturalWidth / 2,
          height: e.currentTarget.naturalHeight / 2,
        })
      }
      className={`h-auto max-w-full rounded-lg border border-line ${className}`}
    />
  );
  return (
    <figure className="flex flex-col items-start gap-1.5">
      {img('light', 'dark:hidden')}
      {img('dark', 'hidden dark:block')}
      {/* The same words as the image's alt text, so screen readers skip it. */}
      <figcaption aria-hidden className="text-[12px] leading-[1.45] text-fg-subtle">
        {alt}
      </figcaption>
    </figure>
  );
}

/** Text with the query's matches marked. */
function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(query); i !== -1; i = lower.indexOf(query, i + query.length)) {
    parts.push(text.slice(at, i));
    parts.push(
      <mark key={i} className="rounded-[2px] bg-focus/30 text-fg">
        {text.slice(i, i + query.length)}
      </mark>,
    );
    at = i + query.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function useWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * The Guide (components.md, Guide): table of contents with search, the
 * article with On this page and previous/next, and deep links that mark the
 * linked section. It replaces the sidebar and the main area.
 */
export function GuideView({
  at,
  linked,
  from,
  onNavigate,
  onBack,
}: {
  at: GuideTarget;
  /** Bumped by each deep link, so the same section can be marked again. */
  linked: number;
  /** Where the deep link came from ("PROJ-1 Fix login", "Home"), for Back. */
  from: string | null;
  onNavigate: (to: GuideTarget, deep: boolean) => void;
  onBack: (() => void) | null;
}) {
  const pages = guidePages();
  const page = pages.find((p) => p.id === at.page) ?? (pages[0] as GuidePage);
  const index = pages.indexOf(page);
  const width = useWidth();
  const narrow = width < 760;
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set([page.section]));
  const [flash, setFlash] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const pageHeadings = headings(page.blocks);

  // The current section stays expanded.
  useEffect(() => {
    setOpen((current) =>
      current.has(page.section) ? current : new Set(current).add(page.section),
    );
  }, [page.section]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: once per page or deep link
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const section = at.section ? el.querySelector<HTMLElement>(`[data-sec="${at.section}"]`) : null;
    el.scrollTop = section ? Math.max(0, section.offsetTop - 28) : 0;
    setActive(at.section ?? null);
    if (!section || linked === 0) return;
    setFlash(at.section ?? null);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const clear = () => setFlash(null);
      el.addEventListener('scroll', clear, { once: true });
      return () => el.removeEventListener('scroll', clear);
    }
    const timer = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(timer);
  }, [page.id, at.section, linked]);

  // ⌘F searches, Esc clears the search then returns to the article, ⌘[ goes back.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (matchShortcut('guideSearch', e, isMac) !== -1) {
      e.preventDefault();
      e.stopPropagation();
      if (narrow) setMenu(true);
      requestAnimationFrame(() => search.current?.focus());
    } else if (matchShortcut('guideBack', e, isMac) !== -1 && onBack) {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    } else if (e.key === 'Escape') {
      if (menu) setMenu(false);
      else if (query) setQuery('');
      else scroller.current?.focus();
      e.preventDefault();
      e.stopPropagation();
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);

  const go = (to: GuideTarget, deep = false) => {
    setMenu(false);
    onNavigate(to, deep);
  };
  const link = (href: string) => {
    if (/^https?:/.test(href)) {
      void trpcClient.shell.openExternal.mutate({ url: href });
      return;
    }
    // The issue forms, as Help › Report a Bug… and Request a Feature… (spec §6.12).
    if (isGuideAction(href)) {
      if (href === 'app:report-bug') void trpcClient.shell.reportBug.mutate();
      else void trpcClient.shell.requestFeature.mutate();
      return;
    }
    const to = target(href);
    go({ page: to.page || page.id, section: to.section }, Boolean(to.section));
  };

  // Which heading is in view, for On this page.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    let current: string | null = null;
    for (const h of pageHeadings) {
      const section = el.querySelector<HTMLElement>(`[data-sec="${h.id}"]`);
      if (section && section.offsetTop - 40 <= el.scrollTop) current = h.id;
    }
    setActive(current);
  };

  const results = useMemo(
    () =>
      q
        ? pages
            .filter((p) => `${p.title} ${p.text}`.toLowerCase().includes(q))
            .map((p) => {
              const i = p.text.toLowerCase().indexOf(q);
              const start = Math.max(0, i - 36);
              const snippet =
                i < 0
                  ? p.text.slice(0, 110)
                  : `${start ? '…' : ''}${p.text.slice(start, i + q.length + 80)}`;
              return { page: p, snippet };
            })
        : [],
    [q, pages],
  );

  // Blocks grouped by their `##`, so a deep link can mark one section.
  const groups: { id: string | null; blocks: Block[] }[] = [{ id: null, blocks: [] }];
  for (const block of page.blocks) {
    if (block.t === 'h2') groups.push({ id: block.id, blocks: [] });
    (groups[groups.length - 1] as { blocks: Block[] }).blocks.push(block);
  }
  const prev = pages[index - 1];
  const next = pages[index + 1];
  const showRail = !narrow && width >= 900 && pageHeadings.length >= 3;
  const activeId = active ?? pageHeadings[0]?.id;

  const toc = (
    <nav
      aria-label="Guide contents"
      className={`flex w-64 flex-none flex-col border-r border-line bg-canvas ${
        narrow ? 'absolute top-9 bottom-0 left-0 z-10 w-[300px] max-w-[86%] shadow-overlay' : ''
      }`}
    >
      <div className="p-2.5">
        <div className="relative">
          <input
            ref={search}
            type="search"
            aria-label="Search the Guide"
            data-guide-search
            placeholder="Search the Guide"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`h-7.5 w-full rounded-md border bg-term pr-14 pl-2.5 text-md outline-none placeholder:text-fg-subtle ${
              q ? 'border-focus' : 'border-line-strong'
            }`}
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
            {query ? null : <Kbd>{keyHint('guideSearch')}</Kbd>}
          </span>
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              className={`${iconButton} absolute top-1/2 right-1 size-5 -translate-y-1/2`}
              onClick={() => setQuery('')}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!q ? (
          SECTIONS.map((section, s) => {
            const sectionPages = pages.filter((p) => p.section === section.title);
            const current = section.title === page.section;
            const single = sectionPages.length === 1;
            const expanded = !single && open.has(section.title);
            return (
              <div key={section.title}>
                <button
                  type="button"
                  data-guide-section={section.title}
                  className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-md hover:bg-raised ${
                    current ? 'font-semibold text-fg' : 'text-fg-muted'
                  }`}
                  onClick={() => {
                    if (single) go({ page: sectionPages[0]?.id ?? page.id });
                    else {
                      setOpen((o) => {
                        const n = new Set(o);
                        if (n.has(section.title)) n.delete(section.title);
                        else n.add(section.title);
                        return n;
                      });
                    }
                  }}
                >
                  <span className={`w-2.5 text-[9px] text-fg-subtle ${single ? 'invisible' : ''}`}>
                    {expanded ? '▾' : '▸'}
                  </span>
                  <span className="w-4 font-mono text-xs text-fg-subtle">{s + 1}</span>
                  <span className="truncate">{section.title}</span>
                </button>
                {expanded
                  ? sectionPages.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        data-guide-page={p.id}
                        aria-current={p.id === page.id ? 'page' : undefined}
                        className={`flex h-[26px] w-full items-center rounded-md pr-2 pl-[42px] text-left text-md ${
                          p.id === page.id
                            ? 'bg-selected font-medium text-fg'
                            : 'text-fg-muted hover:bg-raised hover:text-fg'
                        }`}
                        onClick={() => go({ page: p.id })}
                      >
                        <span className="truncate">{p.title}</span>
                      </button>
                    ))
                  : null}
              </div>
            );
          })
        ) : results.length > 0 ? (
          <div data-guide-results>
            <div className="px-2 pb-1.5 text-sm text-fg-subtle">
              {results.length} {results.length === 1 ? 'page' : 'pages'}
            </div>
            {results.map(({ page: p, snippet }) => (
              <button
                key={p.id}
                type="button"
                data-guide-result={p.id}
                onClick={() => go({ page: p.id })}
                className={`flex w-full flex-col gap-[3px] rounded-md px-2 pt-2 pb-[9px] text-left hover:bg-raised ${
                  p.id === page.id ? 'bg-selected' : ''
                }`}
              >
                <span className="text-xs text-fg-subtle">{p.section}</span>
                <span className="text-md font-medium">
                  <Marked text={p.title} query={q} />
                </span>
                <span className="line-clamp-2 text-sm leading-[1.45] text-fg-muted">
                  <Marked text={snippet} query={q} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-2.5 py-4" data-guide-no-results>
            <span className="text-md font-semibold [overflow-wrap:anywhere]">
              No pages match “{query.trim()}”
            </span>
            <span className="text-sm leading-[1.5] text-pretty text-fg-muted">
              Search looks in page titles and text. Try a shorter word, or start from one of these:
            </span>
            <div className="flex flex-col gap-0.5">
              {['troubleshooting', 'shortcuts', 'building-blocks'].map((id) => (
                <button
                  key={id}
                  type="button"
                  className="-mx-2 flex h-[26px] items-center rounded-md px-2 text-left text-md underline decoration-line-strong underline-offset-[3px] hover:bg-raised"
                  onClick={() => {
                    setQuery('');
                    go({ page: id });
                  }}
                >
                  {pages.find((p) => p.id === id)?.title}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="flex h-[26px] items-center gap-2 self-start rounded-md border border-line-strong px-2.5 text-sm hover:bg-raised"
              onClick={() => setQuery('')}
            >
              Clear search <Kbd>Esc</Kbd>
            </button>
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div data-guide className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas text-fg">
      {narrow ? (
        <div className="flex h-9 flex-none items-center gap-2.5 border-b border-line bg-surface px-3">
          <button
            type="button"
            aria-expanded={menu}
            className={`flex h-[26px] items-center gap-2 rounded-[5px] border border-line-strong px-2 text-[12.5px] font-medium ${menu ? 'bg-raised' : ''}`}
            onClick={() => setMenu(!menu)}
          >
            ☰ Contents <span className="text-[8px] text-fg-subtle">▼</span>
          </button>
          <span className="min-w-0 truncate text-sm text-fg-subtle">
            {page.section} › <span className="text-fg">{page.title}</span>
          </span>
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        {!narrow || menu ? toc : null}
        {narrow && menu ? (
          <button
            type="button"
            aria-label="Close contents"
            className="absolute inset-0 z-[5] bg-scrim"
            onClick={() => setMenu(false)}
          />
        ) : null}
        <div
          ref={scroller}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Esc returns focus to the article
          tabIndex={0}
          onScroll={onScroll}
          className="relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none"
        >
          <div className={`flex gap-10 ${narrow ? 'p-[22px]' : 'px-10 py-9'}`}>
            <article
              className="flex min-w-0 max-w-[660px] flex-1 flex-col"
              data-guide-article={page.id}
            >
              {from && onBack ? (
                <div className="mb-[18px] flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    data-guide-back
                    className="-ml-1.5 flex h-6 items-center gap-1.5 rounded-[5px] pr-2 pl-1.5 text-sm hover:bg-raised"
                    onClick={onBack}
                  >
                    ← Back to {from}
                  </button>
                  <span className="text-sm text-fg-subtle">Opened from {from}</span>
                </div>
              ) : null}
              <div className="mb-1.5 flex items-center gap-2 text-sm text-fg-subtle">
                <span className="font-mono">{page.number}</span>
                <span>{page.section}</span>
              </div>
              <h1 className="mb-3.5 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance">
                {page.title}
              </h1>
              {groups
                .filter((g) => g.blocks.length > 0)
                .map((g) => {
                  const isLinked = flash !== null && g.id === flash;
                  return (
                    <div
                      key={g.id ?? 'top'}
                      data-sec={g.id ?? 'top'}
                      data-linked={isLinked || undefined}
                      // The band appears at once and fades out over 1.2 s.
                      className={`relative -mx-4 flex flex-col gap-3.5 rounded-lg px-4 ${
                        g.id ? 'mt-3.5 pt-3.5' : ''
                      } ${
                        isLinked
                          ? 'bg-focus/11 pb-4 shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-focus)_50%,transparent)]'
                          : 'transition-[background-color,box-shadow] duration-[1200ms] ease-out'
                      }`}
                    >
                      {isLinked ? (
                        <span className="absolute -top-[9px] right-3 flex h-[18px] items-center rounded-full bg-focus px-[7px] text-[10.5px] font-semibold text-on-fg">
                          Linked
                        </span>
                      ) : null}
                      {g.blocks.map((b, i) => (
                        <BlockView key={i} block={b} onLink={link} />
                      ))}
                    </div>
                  );
                })}
              {prev || next ? (
                <div className="mt-10 grid grid-cols-2 gap-3 border-t border-line pt-5">
                  {prev ? (
                    <button
                      type="button"
                      data-guide-prev
                      className="flex flex-col items-start gap-[3px] rounded-[7px] border border-line px-3.5 py-[11px] text-left hover:bg-raised"
                      onClick={() => go({ page: prev.id })}
                    >
                      <span className="text-xs text-fg-subtle">← Previous</span>
                      <span className="text-md font-semibold">{prev.title}</span>
                      <span className="text-xs text-fg-subtle">{prev.section}</span>
                    </button>
                  ) : null}
                  {next ? (
                    <button
                      type="button"
                      data-guide-next
                      className={`flex flex-col items-end gap-[3px] rounded-[7px] border border-line px-3.5 py-[11px] text-right hover:bg-raised ${prev ? '' : 'col-start-2'}`}
                      onClick={() => go({ page: next.id })}
                    >
                      <span className="text-xs text-fg-subtle">Next →</span>
                      <span className="text-md font-semibold">{next.title}</span>
                      <span className="text-xs text-fg-subtle">{next.section}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
            {showRail ? (
              <aside
                className="sticky top-0 w-44 flex-none self-start pt-1"
                aria-label="On this page"
              >
                <span className="block pb-2 pl-3 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                  On this page
                </span>
                {pageHeadings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`block w-full border-l py-1 pl-3 text-left text-sm ${
                      h.id === activeId
                        ? 'border-fg font-medium text-fg'
                        : 'border-line text-fg-muted hover:text-fg'
                    }`}
                    onClick={() => go({ page: page.id, section: h.id })}
                  >
                    {h.text}
                  </button>
                ))}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
