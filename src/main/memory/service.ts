import { EventEmitter } from 'node:events';
import { MEMORY_INTERVAL_MS, type MemorySnapshot, type SessionMemory } from '@shared/memory';
import type { SessionInfo } from '@shared/terminal-protocol';
import { appMemory, measureSession, processTree } from './measure';
import type { ProcessEntry } from './processes';

export interface MemoryMonitorOptions {
  /** The running Claude sessions with their process ids. */
  sessions: () => { info: SessionInfo; pid: number }[];
  /** What the status bar calls a session: its workspace's task id or name, or its project. */
  label: (info: SessionInfo) => string;
  readProcesses: () => Promise<ProcessEntry[]>;
  /** The app's own processes; the fallback is Electron's figure. */
  appProcesses: () => { pid: number; fallbackBytes: number }[];
  /** Whether a window is shown and not minimized (spec §6.14). */
  visible: () => boolean;
  intervalMs?: number;
}

/**
 * Measures the memory of Claude sessions and the app (spec §6.14) every 10
 * seconds while the window is visible, and right when it shows again.
 */
export class MemoryMonitor {
  private readonly events = new EventEmitter();
  private snapshot: MemorySnapshot | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly options: MemoryMonitorOptions) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.options.visible()) void this.refresh();
    }, this.options.intervalMs ?? MEMORY_INTERVAL_MS);
    if (this.options.visible()) void this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  current(): MemorySnapshot | null {
    return this.snapshot;
  }

  /** Measures now; a measurement already under way is shared. */
  refresh(): Promise<void> {
    this.running ??= this.measure().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Drops sessions that ended, without measuring again. */
  sessionsChanged(): void {
    if (!this.snapshot) return;
    const live = new Set(this.options.sessions().map((s) => s.info.id));
    const sessions = this.snapshot.sessions.filter((s) => live.has(s.sessionId));
    if (sessions.length === this.snapshot.sessions.length) return;
    this.snapshot = { ...this.snapshot, sessions };
    this.events.emit('change');
  }

  onChange(listener: () => void): () => void {
    this.events.on('change', listener);
    return () => this.events.off('change', listener);
  }

  private async measure(): Promise<void> {
    let entries: ProcessEntry[];
    try {
      entries = await this.options.readProcesses();
    } catch (error) {
      console.error('reading the process table failed', error);
      return;
    }
    const tree = processTree(entries);
    const sessions: SessionMemory[] = [];
    for (const { info, pid } of this.options.sessions()) {
      const measured = measureSession(tree, pid);
      if (!measured) continue;
      sessions.push({
        sessionId: info.id,
        profileId: info.profileId,
        projectId: info.projectId,
        workspaceId: info.workspaceId,
        label: this.options.label(info),
        ...measured,
      });
    }
    this.snapshot = {
      at: Date.now(),
      sessions,
      app: appMemory(tree, this.options.appProcesses()),
    };
    this.events.emit('change');
  }
}
