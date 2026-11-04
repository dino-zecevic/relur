import { EventEmitter } from 'node:events';
import {
  canContinue,
  continuesAtStart,
  quitNextStep,
  type ResumeSettings,
  resumePrompt,
  unfinishedKind,
} from '@shared/unfinished';
import type { Workspace } from '@shared/workspaces';
import type { WorkspaceRecords } from '../db/workspaces';

/** One workspace of a run of continue prompts (spec §9.7). */
export interface ContinueItem {
  workspaceId: string;
  /**
   * waiting: not sent yet; sent; stopped: cancelled with Stop; skipped: the
   * marker went away first (a prompt was typed); held: plan usage is at its
   * limit; failed: Claude couldn't start.
   */
  state: 'waiting' | 'sent' | 'stopped' | 'skipped' | 'held' | 'failed';
  reason: string | null;
}

/** What the window shows: the run in progress (the notice) and the start's overview. */
export interface UnfinishedState {
  /** The continue prompts being sent, one after another; empty when none. */
  run: { items: ContinueItem[]; running: boolean };
  /** The workspaces this start asks about (the overview dialog), until answered. */
  overview: string[] | null;
}

/** What the service needs from the rest of the app; replaced in tests. */
export interface UnfinishedDeps {
  records: WorkspaceRecords;
  /** The profile's continue setting; null when the profile is gone. */
  settings(profileId: string): ResumeSettings | null;
  /** The profiles in their tab order, for the order of the run. */
  profileOrder(): string[];
  /** Why nothing may be sent in this profile now (plan limit), or null. */
  limit(profileId: string): string | null;
  claudeRunning(workspaceId: string): boolean;
  /** Starts the workspace's Claude, resuming its conversation (spec §9.4). */
  startClaude(workspaceId: string): Promise<unknown>;
  /** Types the prompt into its Claude (a paste and Enter). */
  send(workspaceId: string, prompt: string): Promise<void> | void;
  /** A workspace's Claude was spawned. */
  onSpawn(listener: (workspaceId: string) => void): () => void;
  /** A workspace's Claude reported SessionStart. */
  onSessionStart(listener: (workspaceId: string) => void): () => void;
}

export interface UnfinishedTiming {
  /** After SessionStart, until Claude's prompt takes input. */
  settleMs: number;
  /** Between two continue prompts ("a few seconds apart"). */
  spacingMs: number;
  /** A Claude that never reports SessionStart counts as resumed after this. */
  readyTimeoutMs: number;
}

export const UNFINISHED_TIMING: UnfinishedTiming = {
  settleMs: 2000,
  spacingMs: 4000,
  readyTimeoutMs: 20_000,
};

/**
 * The order continue prompts go out (spec §9.7): by profile in tab order,
 * then oldest workspace first.
 */
export function continueOrder<W extends Pick<Workspace, 'profileId' | 'createdAt' | 'id'>>(
  workspaces: W[],
  profileIds: string[],
): W[] {
  const rank = (w: W) => {
    const i = profileIds.indexOf(w.profileId);
    return i < 0 ? profileIds.length : i;
  };
  return [...workspaces].sort(
    (a, b) =>
      rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Work that the app's stop interrupted (spec §9.7): marks it at quit (and
 * after a crash, from the stored states), continues it at the next start
 * where the profile says so, and asks about the rest once, in the overview.
 * Continue prompts go out one after another, a few seconds apart, only once
 * the workspace's Claude has resumed, and never while plan usage is at its
 * limit.
 */
export class UnfinishedService {
  private readonly events = new EventEmitter();
  private run: UnfinishedState['run'] = { items: [], running: false };
  private overview: string[] | null = null;
  /** Workspaces whose Claude was spawned and hasn't reported SessionStart, with who waits. */
  private readonly starting = new Map<string, (() => void)[]>();
  /** Ends the wait between two prompts early (Stop). */
  private wake: (() => void) | null = null;

  constructor(
    private readonly deps: UnfinishedDeps,
    private readonly timing: UnfinishedTiming = UNFINISHED_TIMING,
  ) {
    deps.onSpawn((id) => {
      if (!this.starting.has(id)) this.starting.set(id, []);
    });
    deps.onSessionStart((id) => {
      const waiting = this.starting.get(id);
      this.starting.delete(id);
      for (const resolve of waiting ?? []) resolve();
    });
  }

  /**
   * The app is quitting with these workspaces' Claude still running: each
   * that was working, interrupted with Esc or asking for permission is marked
   * (spec §9.7). Run before Claude is stopped.
   */
  atQuit(workspaceIds: string[]): void {
    for (const id of workspaceIds) {
      const workspace = this.deps.records.get(id);
      const kind = workspace ? unfinishedKind(workspace.state, workspace.background) : null;
      if (kind) this.deps.records.setUnfinished(id, kind, { stopped: workspace?.background });
    }
  }

  /**
   * What the quit dialog says comes next for these workspaces (spec §5), or
   * null when none of them would be unfinished.
   */
  quitNote(workspaceIds: string[]): string | null {
    return quitNextStep(
      workspaceIds.flatMap((id) => {
        const workspace = this.deps.records.get(id);
        const kind = workspace ? unfinishedKind(workspace.state, workspace.background) : null;
        if (!workspace || !kind) return [];
        return [{ kind, continues: !!this.deps.settings(workspace.profileId)?.continueAtStart }];
      }),
    );
  }

  /**
   * At start (spec §9.7), with `resumed` settling once Claude has been
   * started again where it ran: the workspaces marked since the last start
   * that were Working are continued where their profile says so and the plan
   * limit allows; the others are asked about in the overview, once the
   * sessions have resumed and those prompts have gone out (or were stopped).
   */
  async atLaunch(resumed: Promise<unknown>): Promise<void> {
    const marked = continueOrder(this.deps.records.takeNewUnfinished(), this.deps.profileOrder());
    if (marked.length === 0) return;
    const automatic = marked.filter(
      (w) =>
        w.unfinished &&
        continuesAtStart(w.unfinished.kind) &&
        this.deps.settings(w.profileId)?.continueAtStart &&
        !this.deps.limit(w.profileId),
    );
    const ask = marked.filter((w) => !automatic.includes(w));
    // Claude is being started again in them meanwhile; never a second one.
    await resumed.catch(() => {});
    if (automatic.length > 0) this.continue(automatic.map((w) => w.id));
    if (ask.length === 0) return;
    await Promise.all(ask.map((w) => this.resumedClaude(w.id)));
    // After the notice: the dialog would cover its Stop.
    await this.runEnded();
    const still = ask.filter((w) => this.deps.records.get(w.id)?.unfinished).map((w) => w.id);
    if (still.length === 0) return;
    this.overview = still;
    this.changed();
  }

  /** The overview was answered (Continue selected, Not now, Open): it isn't shown again. */
  closeOverview(): void {
    if (this.overview === null) return;
    this.overview = null;
    this.changed();
  }

  /**
   * Sends the continue prompt to these workspaces, after any already queued,
   * one after another (spec §9.7). A Claude that isn't running is started
   * first. Permission rows can't be continued.
   */
  continue(workspaceIds: string[]): void {
    if (!this.run.running) this.run = { items: [], running: false };
    const queued = new Set(
      this.run.items.filter((i) => i.state === 'waiting').map((i) => i.workspaceId),
    );
    for (const workspaceId of workspaceIds) {
      if (queued.has(workspaceId)) continue;
      this.run.items.push({ workspaceId, state: 'waiting', reason: null });
    }
    this.changed();
    if (!this.run.running) void this.process();
  }

  /** Stop (spec §9.7): the prompts not yet sent are cancelled; those workspaces stay marked. */
  stop(): void {
    for (const item of this.run.items) if (item.state === 'waiting') item.state = 'stopped';
    this.wake?.();
    this.changed();
  }

  /** Dismiss in the workspace's bar: the marker goes, nothing is sent. */
  dismiss(workspaceId: string): void {
    this.deps.records.setUnfinished(workspaceId, null);
  }

  state(): UnfinishedState {
    return {
      run: { items: this.run.items.map((i) => ({ ...i })), running: this.run.running },
      overview: this.overview,
    };
  }

  onChange(listener: () => void): () => void {
    this.events.on('change', listener);
    return () => this.events.off('change', listener);
  }

  private changed(): void {
    this.events.emit('change');
  }

  /** Resolves once no continue prompts are being sent. */
  private runEnded(): Promise<void> {
    if (!this.run.running) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.onChange(() => {
        if (this.run.running) return;
        off();
        resolve();
      });
    });
  }

  /**
   * Resolves once the workspace's Claude has resumed: it reported
   * SessionStart (or never did, within the timeout) and had a moment to
   * show its prompt. At once for a Claude that has been running.
   */
  private async resumedClaude(workspaceId: string): Promise<void> {
    const waiting = this.starting.get(workspaceId);
    if (!waiting) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.timing.readyTimeoutMs);
      waiting.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    await this.sleep(this.timing.settleMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const done = () => {
        clearTimeout(timer);
        if (this.wake === done) this.wake = null;
        resolve();
      };
      timer = setTimeout(done, ms);
      this.wake = done;
    });
  }

  private async process(): Promise<void> {
    this.run.running = true;
    this.changed();
    let sentBefore = false;
    for (;;) {
      const item = this.run.items.find((i) => i.state === 'waiting');
      if (!item) break;
      const settle = (state: ContinueItem['state'], reason: string | null = null) => {
        item.state = state;
        item.reason = reason;
        this.changed();
      };
      const workspace = this.deps.records.get(item.workspaceId);
      if (!workspace?.unfinished) {
        settle('skipped');
        continue;
      }
      if (!canContinue(workspace.unfinished.kind)) {
        settle('skipped', 'Give the permission again in the workspace');
        continue;
      }
      const limit = this.deps.limit(workspace.profileId);
      if (limit) {
        settle('held', limit);
        continue;
      }
      try {
        if (!this.deps.claudeRunning(workspace.id)) await this.deps.startClaude(workspace.id);
        await this.resumedClaude(workspace.id);
        // A few seconds apart.
        if (sentBefore) await this.sleep(this.timing.spacingMs);
      } catch (error) {
        settle('failed', error instanceof Error ? error.message : String(error));
        continue;
      }
      // Stop, a typed prompt or the limit may have come meanwhile.
      if (item.state !== 'waiting') continue;
      const now = this.deps.records.get(workspace.id);
      if (!now?.unfinished) {
        settle('skipped');
        continue;
      }
      const limitNow = this.deps.limit(workspace.profileId);
      if (limitNow) {
        settle('held', limitNow);
        continue;
      }
      try {
        await this.deps.send(workspace.id, resumePrompt(this.deps.settings(workspace.profileId)));
      } catch (error) {
        settle('failed', error instanceof Error ? error.message : String(error));
        continue;
      }
      sentBefore = true;
      this.deps.records.setUnfinished(workspace.id, null);
      settle('sent');
    }
    this.run.running = false;
    this.changed();
  }
}
