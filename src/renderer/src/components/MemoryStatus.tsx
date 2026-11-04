import {
  describeSplit,
  formatBytes,
  formatTotal,
  MEMORY_HIGH_SHARE,
  type MemorySnapshot,
  memoryGroups,
  memoryShare,
  memoryUsed,
  sessionsTotal,
} from '@shared/memory';
import { useEffect, useId, useRef, useState } from 'react';
import { useOpenGuide } from '../guide/link';
import { MeterBar } from './UsageMeter';

/**
 * Memory in the status bar (spec §6.14, components.md): a bar filled by every
 * Claude session and the app relative to the machine's RAM, "2.4 GB of 16 GB",
 * and a panel with the split, the five largest workspaces and what the terms mean.
 */
export function MemoryStatus({ memory }: { memory: MemorySnapshot }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const share = memoryShare(memory);
  const high = share >= MEMORY_HIGH_SHARE;

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    // A click anywhere outside closes it (not a native tooltip, components.md).
    const outside = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    // Esc closes it and puts focus back on the button.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', onEscape, true);
    };
  }, [open]);

  return (
    <span ref={wrapper} className="relative flex items-center">
      <button
        ref={trigger}
        type="button"
        data-memory
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Memory: ${formatBytes(memoryUsed(memory))} of ${formatTotal(memory.total)}`}
        onClick={() => setOpen(!open)}
        className={`flex h-5 items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 hover:bg-raised ${open ? 'bg-raised' : ''}`}
      >
        <span className="text-fg-muted">Memory</span>
        <MeterBar percent={share * 100} high={high} />
        <span data-memory-used className={`font-mono text-xs ${high ? 'text-st-permission' : ''}`}>
          {formatBytes(memoryUsed(memory))}
          <span className="text-fg-subtle"> of {formatTotal(memory.total)}</span>
        </span>
      </button>
      {open ? (
        <MemoryPanel
          id={panelId}
          panelRef={panel}
          memory={memory}
          onLearnMore={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className={`min-w-0 flex-1 truncate ${mono ? 'font-mono text-xs' : ''}`}>{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function MemoryPanel({
  id,
  panelRef,
  memory,
  onLearnMore,
}: {
  id: string;
  panelRef: React.Ref<HTMLDivElement>;
  memory: MemorySnapshot;
  onLearnMore: () => void;
}) {
  const openGuide = useOpenGuide();
  const groups = memoryGroups(memory.sessions);
  const largest = groups.slice(0, 5);
  return (
    <div
      id={id}
      ref={panelRef}
      role="dialog"
      aria-label="Memory"
      tabIndex={-1}
      data-memory-panel
      className="absolute right-0 bottom-full z-50 mb-1.5 w-[340px] rounded-md border border-line-strong bg-raised p-3 text-sm text-fg shadow-overlay outline-none"
    >
      <div className="flex items-baseline gap-2">
        <span className="flex-1 font-medium">Memory</span>
        <span className="font-mono text-xs">
          {formatBytes(memoryUsed(memory))}
          <span className="text-fg-muted"> of {formatTotal(memory.total)}</span>
        </span>
      </div>
      <div className="mt-2 space-y-1" data-memory-split>
        <Row label="Claude sessions" value={formatBytes(sessionsTotal(memory))} />
        <Row label="This app" value={formatBytes(memory.app)} />
      </div>
      <div className="mt-3 border-t border-line pt-2.5">
        <div className="mb-1.5 text-xs text-fg-muted">Largest workspaces</div>
        {largest.length === 0 ? (
          <div className="text-fg-muted">No Claude session is running.</div>
        ) : (
          <ul className="space-y-1.5" data-memory-largest>
            {largest.map((g) => (
              <li key={g.key}>
                <Row label={g.label} value={formatBytes(g.total)} mono />
                <div className="truncate text-xs text-fg-muted" title={describeSplit(g)}>
                  {describeSplit(g)}
                </div>
              </li>
            ))}
            {groups.length > largest.length ? (
              <li className="text-xs text-fg-muted">and {groups.length - largest.length} more</li>
            ) : null}
          </ul>
        )}
      </div>
      <dl
        className="mt-3 space-y-1 border-t border-line pt-2.5 text-xs text-fg-muted"
        data-memory-terms
      >
        <div>
          <dt className="inline font-medium text-fg">Claude</dt>
          <dd className="inline">: Claude Code's own process.</dd>
        </div>
        <div>
          <dt className="inline font-medium text-fg">Other</dt>
          <dd className="inline">
            : what Claude started: MCP servers, its shells, background commands, dev servers.
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-fg">This app</dt>
          <dd className="inline">: its window and helper processes.</dd>
        </div>
        <div>
          <dt className="inline font-medium text-fg">Not counted</dt>
          <dd className="inline">
            : shells you open in terminal tabs, and processes that detach from Claude.
          </dd>
        </div>
      </dl>
      <div className="mt-2.5 flex items-center gap-2 text-xs text-fg-subtle">
        <span className="flex-1">Bar: all of this, relative to the machine's RAM.</span>
        <button
          type="button"
          data-guide-to="memory"
          onClick={() => {
            onLearnMore();
            openGuide('memory');
          }}
          className="text-fg-muted underline underline-offset-2 hover:text-fg"
        >
          Learn more
        </button>
      </div>
    </div>
  );
}
