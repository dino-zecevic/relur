import { formatChord, SHORTCUTS } from '@shared/shortcuts';
import type { StatusGlyph as Glyph } from '@shared/status';
import { SUSPENDED_TOOLTIP } from '@shared/suspend';
import type { SessionInfo } from '@shared/terminal-protocol';
import { isMac, Kbd, keyHint } from '../ui/controls';
import { StatusGlyph } from '../ui/StatusGlyph';

/**
 * A terminal tab's key, ⌃1 – ⌃9, on macOS only: elsewhere Ctrl with a digit
 * switches profiles (spec §6.6).
 */
const tabKey = (index: number): string | null =>
  isMac && index < 9
    ? formatChord({ ...SHORTCUTS.terminalTab.chords[0], code: `Digit${index + 1}` }, true)
    : null;

/**
 * Display names in tab order: "Claude", "Shell", "Shell 2", … In a linked
 * workspace (`repoName` given), Setup tabs are "Setup · <repo>" and shells
 * are named by their repository (spec §21.4).
 */
export function sessionTabNames(
  sessions: SessionInfo[],
  repoName?: (session: SessionInfo) => string,
): Map<string, string> {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const base =
      repoName && session.kind === 'setup'
        ? `Setup · ${repoName(session)}`
        : repoName && session.kind === 'shell'
          ? repoName(session)
          : { shell: 'Shell', claude: 'Claude', home: 'Home', setup: 'Setup' }[session.kind];
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    names.set(session.id, n === 1 ? base : `${base} ${n}`);
  }
  return names;
}

/** One terminal tab (components.md, Terminal tab). */
export function SessionTab({
  session,
  name,
  index,
  active,
  glyph,
  hintOnlyActive = false,
  onSelect,
  onClose,
  onContextMenu,
}: {
  session: SessionInfo;
  name: string;
  index: number;
  active: boolean;
  /** Longer names: the ⌃n hint shows on the active tab only (still in the tooltip). */
  hintOnlyActive?: boolean;
  /** Status glyph for a Claude tab; shells show `$`. */
  glyph?: Glyph | null;
  onSelect: () => void;
  onClose: (() => void) | null;
  /** The tab's own context menu (a main checkout's Claude: Keep Claude Running, spec §9.8). */
  onContextMenu?: () => void;
}) {
  const exited = session.status === 'exited';
  const suspended = session.status === 'suspended';
  const icon =
    session.kind === 'setup' ? (
      // Setup (spec §8.3): working while it runs, an error glyph when it failed.
      !exited ? (
        <StatusGlyph glyph="working" />
      ) : session.exitCode === 0 ? (
        <span className="w-3 text-center font-mono text-diff-add">✓</span>
      ) : (
        <StatusGlyph glyph="error" />
      )
    ) : session.kind === 'claude' ? (
      glyph ? (
        <StatusGlyph glyph={glyph} />
      ) : exited ? (
        <StatusGlyph glyph="exited" />
      ) : (
        <span className="w-3 text-center font-mono text-fg-muted">›</span>
      )
    ) : (
      <span className={`w-3 text-center font-mono ${exited ? 'text-fg-subtle' : 'text-fg-muted'}`}>
        $
      </span>
    );
  const key = tabKey(index);
  return (
    <div
      className={`group relative -mb-px flex h-7.5 items-center gap-2 rounded-t-md px-3 text-md ${
        active ? 'border border-b-0 border-line bg-term text-fg' : 'text-fg-muted hover:bg-raised'
      }`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={`${exited ? `${session.title} (exited)` : session.title}${
          hintOnlyActive && key ? ` (${key})` : ''
        }${suspended ? `\n${SUSPENDED_TOOLTIP}` : ''}`}
        data-suspended={suspended || undefined}
        onContextMenu={
          onContextMenu
            ? (event) => {
                event.preventDefault();
                onContextMenu();
              }
            : undefined
        }
        className="flex items-center gap-2"
        onClick={onSelect}
      >
        {icon}
        <span className={exited ? 'text-fg-subtle' : undefined}>{name}</span>
        {suspended ? <span className="text-xs text-fg-subtle">Suspended</span> : null}
        {key && (active || !hintOnlyActive) ? <Kbd>{key}</Kbd> : null}
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={`Close ${session.title}`}
          title={session.status === 'running' ? 'Stop and close' : 'Close'}
          className={`rounded-sm px-0.5 leading-none text-fg-muted hover:bg-selected hover:text-fg ${
            active ? '' : 'invisible group-hover:visible'
          }`}
          onClick={onClose}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Terminal tabs of a workspace, with + for a new Shell tab. */
export function TerminalTabs({
  sessions,
  activeId,
  glyphs,
  onSelect,
  onClose,
  onNew,
  actions,
  repoName,
  document,
}: {
  sessions: SessionInfo[];
  /** The spec view's tab, after the terminals (spec §13.8). */
  document?: { label: string; active: boolean; onSelect: () => void } | null;
  activeId: string | null;
  glyphs?: Record<string, Glyph | null>;
  /** A linked workspace names Setup and Shell tabs by repository. */
  repoName?: (session: SessionInfo) => string;
  onSelect: (session: SessionInfo) => void;
  onClose: (session: SessionInfo) => (() => void) | null;
  onNew: () => void;
  /** Right-aligned controls for the active tab, such as Copy response. */
  actions?: React.ReactNode;
}) {
  const names = sessionTabNames(sessions, repoName);
  return (
    <div className="flex h-9 shrink-0 items-end gap-0.5 border-b border-line bg-surface px-2">
      <div role="tablist" aria-label="Terminals" className="flex min-w-0 items-end gap-0.5">
        {sessions.map((session, index) => (
          <SessionTab
            key={session.id}
            session={session}
            name={names.get(session.id) ?? session.title}
            index={index}
            active={session.id === activeId}
            glyph={glyphs?.[session.id]}
            hintOnlyActive={Boolean(repoName)}
            onSelect={() => onSelect(session)}
            onClose={onClose(session)}
          />
        ))}
        {document ? (
          <button
            type="button"
            role="tab"
            data-spec-tab
            aria-selected={document.active}
            title={`${document.label}: the workflow's status file, read-only`}
            className={`-mb-px flex h-7.5 items-center gap-2 rounded-t-md px-3 text-md ${
              document.active
                ? 'border border-b-0 border-line bg-term text-fg'
                : 'text-fg-muted hover:bg-raised'
            }`}
            onClick={document.onSelect}
          >
            <span className="w-3 text-center font-mono text-fg-muted">¶</span>
            {document.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        title={repoName ? 'New shell in…' : `New shell (${keyHint('newShell')})`}
        aria-label="New shell"
        className="mb-1 ml-1 inline-flex size-6 items-center justify-center rounded-sm text-fg-muted hover:bg-raised hover:text-fg"
        onClick={onNew}
      >
        +
      </button>
      {actions ? <div className="mb-1 ml-auto flex items-center gap-1">{actions}</div> : null}
    </div>
  );
}
