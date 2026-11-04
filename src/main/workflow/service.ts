import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { type LookupResult, lookupFailed } from '@shared/lookup';
import type { TaskLookup, Workflow } from '@shared/schemas';
import {
  atGate,
  canContinue,
  effectiveWorkflow,
  fixedPrefix,
  promptValues,
  type StatusDocument,
  type WorkflowInfo,
} from '@shared/workflow';
import type { Workspace } from '@shared/workspaces';
import { fillTemplate } from '../changes/finish';
import type { ConfigStore } from '../config/store';
import type { WorkspaceRecords } from '../db/workspaces';
import { documentImages, readDocument } from './document';
import type { TaskLookupService } from './lookup';
import { fieldText, firstHeading, readStatus, type StatusRead } from './read';

/** File changes closer together than this are read once. */
const DEBOUNCE_MS = 300;

/** What the workflow service needs to type a prompt into a workspace's Claude. */
export interface PromptSender {
  sendToClaude(workspaceId: string, prompt: string): void;
}

/** A workspace's workflow changed: before and after, for alerts (spec §13.5). */
export interface WorkflowChange {
  workspaceId: string;
  before: WorkflowInfo | null;
  after: WorkflowInfo | null;
}

const same = (a: WorkflowInfo | null | undefined, b: WorkflowInfo | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Each workspace's workflow status from its status file (spec §13.4, §13.5):
 * read when the file's folder changes, on Claude's Stop and PostToolUse, and
 * when settings change. It has no state of its own: the skills move the status.
 */
export class WorkflowService {
  private readonly events = new EventEmitter();
  private readonly infos = new Map<string, WorkflowInfo | null>();
  private readonly watchers = new Map<string, { dir: string; watcher: fs.FSWatcher }>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** Runs task lookups (spec §13.7); set at startup. */
  lookups: TaskLookupService | null = null;

  constructor(
    private readonly config: ConfigStore,
    private readonly records: WorkspaceRecords,
    private readonly sender: PromptSender,
  ) {
    config.onChange(() => this.refreshAll());
    records.onChange(() => this.sync());
  }

  /** The workflow that applies to a workspace (its main project's, else its profile's). */
  settingsFor(workspace: Pick<Workspace, 'profileId' | 'projectId'>): Workflow | null {
    const config = this.config.get().config;
    const profile = config?.profiles.find((p) => p.id === workspace.profileId);
    const project = config?.projects.find((p) => p.id === workspace.projectId);
    return profile && project ? effectiveWorkflow(profile, project) : null;
  }

  /** The workspace's workflow as last read; read now if it hasn't been. */
  info(workspaceId: string): WorkflowInfo | null {
    if (!this.infos.has(workspaceId)) this.refresh(workspaceId);
    return this.infos.get(workspaceId) ?? null;
  }

  /** Reads the workspace's status file again; emits a change when the result differs. */
  refresh(workspaceId: string): void {
    const workspace = this.records.get(workspaceId);
    const workflow = workspace ? this.settingsFor(workspace) : null;
    const read =
      workspace && workflow
        ? readStatus(workspace.worktreePath, workflow, {
            branch: workspace.branch,
            taskId: workspace.task.id,
          })
        : null;
    const next = read?.info ?? null;
    // A workspace without a title, or adopted, takes it from the file once (spec §13.5).
    const title = workflow?.titleField ? fieldText(read?.fields?.[workflow.titleField]) : null;
    if (workspace && title && this.records.titleFromStatusPending(workspaceId)) {
      this.records.setTitleFromStatusPending(workspaceId, false);
      if (title !== workspace.task.title) this.records.setTaskTitle(workspaceId, title);
    }
    this.watch(
      workspaceId,
      workspace && workflow ? path.join(workspace.worktreePath, fixedPrefix(workflow.file)) : null,
    );
    const had = this.infos.has(workspaceId);
    const before = this.infos.get(workspaceId) ?? null;
    if (workspace) this.infos.set(workspaceId, next);
    else this.infos.delete(workspaceId);
    if (had && !same(before, next)) {
      this.events.emit('change', { workspaceId, before, after: next } satisfies WorkflowChange);
    }
    // The spec view reads the file again (spec §13.8).
    if (next?.file) this.events.emit(`document:${workspaceId}`);
  }

  /** The workspace's status file for the spec view (spec §13.8); null without one. */
  document(workspaceId: string): StatusDocument | null {
    const workspace = this.records.get(workspaceId);
    const workflow = workspace ? this.settingsFor(workspace) : null;
    const file = this.info(workspaceId)?.file;
    if (!workspace || !workflow || !file) return null;
    return readDocument(workspace.worktreePath, file, workflow);
  }

  /** The status file's relative images as `data:` URLs (spec §13.8). */
  documentImages(workspaceId: string, sources: string[]): Record<string, string | null> {
    const workspace = this.records.get(workspaceId);
    const file = this.info(workspaceId)?.file;
    if (!workspace || !file) return Object.fromEntries(sources.map((s) => [s, null]));
    return documentImages(workspace.worktreePath, file, sources);
  }

  /** The status file's full path, for Open in editor and Reveal. */
  documentPath(workspaceId: string): string {
    const workspace = this.records.get(workspaceId);
    const file = this.info(workspaceId)?.file;
    if (!workspace || !file) throw new Error('This workspace has no status file');
    return path.join(workspace.worktreePath, file);
  }

  /** Called when the workspace's status file may have changed. */
  onDocument(workspaceId: string, listener: () => void): () => void {
    this.events.on(`document:${workspaceId}`, listener);
    return () => this.events.off(`document:${workspaceId}`, listener);
  }

  /** Every workspace again, as after a settings change. */
  refreshAll(): void {
    for (const w of this.records.list()) this.refresh(w.id);
    this.sync();
  }

  /** New workspaces are read, archived ones forgotten. */
  private sync(): void {
    const ids = new Set(this.records.list().map((w) => w.id));
    for (const id of ids) if (!this.infos.has(id)) this.refresh(id);
    for (const id of [...this.infos.keys()]) {
      if (ids.has(id)) continue;
      this.infos.delete(id);
      this.watch(id, null);
    }
  }

  /** Watches the folder the pattern starts in, recursively, while it exists. */
  private watch(workspaceId: string, dir: string | null): void {
    const current = this.watchers.get(workspaceId);
    const exists = dir !== null && fs.existsSync(dir);
    if (current && exists && current.dir === dir) return;
    if (current) {
      current.watcher.close();
      this.watchers.delete(workspaceId);
    }
    if (!exists || dir === null) return;
    try {
      const watcher = fs.watch(dir, { recursive: true }, () => {
        clearTimeout(this.timers.get(workspaceId));
        this.timers.set(
          workspaceId,
          setTimeout(() => {
            this.timers.delete(workspaceId);
            this.refresh(workspaceId);
          }, DEBOUNCE_MS),
        );
      });
      watcher.on('error', () => this.watch(workspaceId, null));
      this.watchers.set(workspaceId, { dir, watcher });
    } catch {
      // Hook events still re-read it.
    }
  }

  /**
   * The workspace as the UI sees it (spec §13.5): with its workflow, and as
   * Awaiting approval with the gate's label while it waits at a gate.
   */
  decorate(workspace: Workspace): Workspace {
    const workflow = this.info(workspace.id);
    if (!atGate(workspace.state, workflow)) return { ...workspace, workflow };
    return {
      ...workspace,
      workflow,
      state: 'awaiting-approval',
      stateMessage: `Waits for you: ${workflow?.label}`,
    };
  }

  /**
   * Continue (spec §13.5): types the filled-in Continue prompt into the idle
   * Claude, at a step status only. A gate waits for a person's own answer.
   */
  continue(workspaceId: string): void {
    const { workspace, workflow, info } = this.idleAt(workspaceId);
    if (info.kind === 'final') throw new Error(`${info.label} is a final status`);
    if (info.kind === 'gate') {
      throw new Error(`${info.label} waits for your answer in Claude, not for Continue`);
    }
    this.sender.sendToClaude(
      workspaceId,
      fillTemplate(workflow.continuePrompt, promptValues(workspace, info.status)),
    );
  }

  /** A gate's answer button (spec §13.5): types its text into the idle Claude. */
  answer(workspaceId: string): void {
    const { workspace, info } = this.idleAt(workspaceId);
    const answer = info.kind === 'gate' ? info.statuses[info.index]?.answer : null;
    if (!answer) throw new Error(`${info.label} has no answer button`);
    this.sender.sendToClaude(
      workspaceId,
      fillTemplate(answer.prompt, promptValues(workspace, info.status)),
    );
  }

  /** The workspace with its workflow and status, while its Claude runs and is idle. */
  private idleAt(workspaceId: string) {
    const workspace = this.records.get(workspaceId);
    if (!workspace) throw new Error('This workspace no longer exists');
    const workflow = this.settingsFor(workspace);
    const info = this.info(workspaceId);
    if (!workflow || !info?.status) throw new Error('This workspace has no workflow status');
    if (!canContinue(workspace.state)) {
      throw new Error(
        workspace.state === 'exited' || workspace.state === 'error'
          ? "Claude isn't running in this workspace; start it first"
          : 'Claude is busy; continue when it stops',
      );
    }
    return { workspace, workflow, info: info as WorkflowInfo & { status: string } };
  }

  /**
   * The filled-in Start prompt (spec §13.5): the project's own, else its
   * workflow's. Only for a task with an id; without one Claude starts plainly.
   */
  startPrompt(workspace: Workspace): string | null {
    if (!workspace.task.id) return null;
    const project = this.config.get().config?.projects.find((p) => p.id === workspace.projectId);
    const template = project?.startPrompt ?? this.settingsFor(workspace)?.startPrompt;
    if (!template) return null;
    return (
      fillTemplate(template, promptValues(workspace, this.info(workspace.id)?.status ?? null)) ||
      null
    );
  }

  /**
   * The task named in an unknown worktree's status file (spec §13.6): its id
   * field, and its title field or first heading. Null without a workflow or a
   * file for the branch.
   */
  prefill(
    projectId: string,
    worktree: string,
    branch: string,
  ): { taskId: string | null; title: string | null; titleFromField: boolean } | null {
    const project = this.config.get().config?.projects.find((p) => p.id === projectId);
    const workflow = project ? this.settingsFor({ profileId: project.profileId, projectId }) : null;
    if (!workflow) return null;
    const { info, fields } = readStatus(
      worktree,
      { ...workflow, match: { ...workflow.match, equals: 'branch' } },
      {
        branch,
        taskId: null,
      },
    );
    if (!info.file || !fields) return null;
    const taskId = workflow.idField ? fieldText(fields[workflow.idField]) : null;
    const fromField = workflow.titleField ? fieldText(fields[workflow.titleField]) : null;
    return {
      taskId,
      title: fromField ?? firstHeading(worktree, info.file),
      titleFromField: fromField !== null,
    };
  }

  /**
   * Looks up a task's title from its id (spec §13.7) with `lookup`, or the
   * profile's own when none is given (New workspace).
   */
  async lookupTitle(options: {
    requestId: string;
    profileId: string;
    projectId: string | null;
    taskId: string;
    lookup: TaskLookup | null;
  }): Promise<LookupResult> {
    const lookup =
      options.lookup ??
      this.config.get().config?.profiles.find((p) => p.id === options.profileId)?.taskLookup;
    if (!lookup) return lookupFailed('No task lookup is set up');
    if (!this.lookups) return lookupFailed('Task lookups are not available');
    // New workspace's (no lookup given) remember found titles; Test always asks.
    return this.lookups.run({ ...options, lookup, remember: options.lookup === null });
  }

  cancelLookup(requestId: string): void {
    this.lookups?.cancel(requestId);
  }

  /** Edit profile › Workflow (spec §13.4): null removes it. A lookup kept in it moves out. */
  saveProfile(profileId: string, workflow: Workflow | null): void {
    this.lookups?.forget(profileId);
    this.config.update((raw) => {
      const profile = rawEntry(raw.profiles, profileId, 'profile');
      liftRawLookup(profile);
      if (!workflow) delete profile.workflow;
      else profile.workflow = { ...workflow, startPrompt: workflow.startPrompt?.trim() || null };
    });
  }

  /** Edit profile › Task lookup (spec §13.7): null removes it. */
  saveLookup(profileId: string, lookup: TaskLookup | null): void {
    this.lookups?.forget(profileId);
    this.config.update((raw) => {
      const profile = rawEntry(raw.profiles, profileId, 'profile');
      liftRawLookup(profile);
      if (lookup) profile.taskLookup = lookup;
      else delete profile.taskLookup;
    });
  }

  /**
   * The project's Workflow tab (spec §13.4, §13.5): its own workflow, none
   * (false) or the profile's (null), and its Start prompt (null clears it).
   */
  saveProject(
    projectId: string,
    workflow: Workflow | false | null,
    startPrompt: string | null,
  ): void {
    const prompt = startPrompt?.trim() || null;
    this.config.update((raw) => {
      const project = rawEntry(raw.projects, projectId, 'project');
      if (workflow === null) delete project.workflow;
      else project.workflow = workflow;
      if (prompt) project.startPrompt = prompt;
      else delete project.startPrompt;
    });
  }

  /**
   * The settings UI's preview (spec §13.4): what a workflow, saved or not,
   * finds in one workspace's worktree.
   */
  preview(workflow: Workflow, workspaceId: string): StatusRead {
    const workspace = this.records.get(workspaceId);
    if (!workspace) throw new Error('This workspace no longer exists');
    return readStatus(workspace.worktreePath, workflow, {
      branch: workspace.branch,
      taskId: workspace.task.id,
    });
  }

  onChange(listener: (change: WorkflowChange) => void): () => void {
    this.events.on('change', listener);
    return () => this.events.off('change', listener);
  }

  dispose(): void {
    for (const id of [...this.watchers.keys()]) this.watch(id, null);
    for (const timer of this.timers.values()) clearTimeout(timer);
  }
}

/** Moves a lookup still kept in the profile's workflow to `taskLookup`, unless it has one. */
function liftRawLookup(profile: Record<string, unknown>): void {
  const workflow = profile.workflow as Record<string, unknown> | undefined;
  if (!workflow || typeof workflow !== 'object' || !('lookup' in workflow)) return;
  if (!('taskLookup' in profile) && workflow.lookup) profile.taskLookup = workflow.lookup;
  delete workflow.lookup;
}

function rawEntry(list: unknown, id: string, what: string): Record<string, unknown> {
  const entry = (Array.isArray(list) ? (list as Record<string, unknown>[]) : []).find(
    (e) => e?.id === id,
  );
  if (!entry) throw new Error(`Unknown ${what} "${id}"`);
  return entry;
}
